# 1.材料を集める
# 2.実行ロールを作る
# 3.関数と入口を作る

# `terraform apply`しているAWSアカウントのIDを読む
data "aws_caller_identity" "current" {}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../api/dist/lambda/index.cjs"
  output_path = "${path.module}/../api/dist/lambda/index.zip"
}

# 信頼ポリシーのJSONを組み立てる
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# 関数がDynamoDBやログを触るときに名乗る身分｡ 直前の信頼ポリシーを付ける
resource "aws_iam_role" "lambda" {
  name               = "${var.function_name}-execution"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# CloudWatch Logsへログを書く権限
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# itemsテーブルへのアクセス権を､そのロールに足す
resource "aws_iam_role_policy" "lambda_items" {
  name = "${var.function_name}-items"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.items.arn
      }
    ]
  })
}

# ログの入れ物を作成する
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14
}

# 関数本体｡ `api/src/lambda.ts`のhandlerを呼ぶ
resource "aws_lambda_function" "api" {
  function_name    = var.function_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      ITEMS_TABLE = aws_dynamodb_table.items.name
    }
  }

  # ロググループができてから関数を作る
  depends_on = [aws_cloudwatch_log_group.lambda]
}

# 関数にHTTPSのURLを付ける
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

# 許可タイプを指定する
resource "aws_lambda_permission" "function_url" {
  statement_id           = "AllowAccountFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
  function_url_auth_type = "AWS_IAM"
}

# Function URL 経由の呼び出しに限り許可する
resource "aws_lambda_permission" "invoke" {
  statement_id             = "AllowAccountInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
  invoked_via_function_url = true
}
