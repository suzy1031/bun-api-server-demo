resource "aws_ecr_repository" "web" {
  name                 = "web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  tags = {
    Name = "web"
  }
}

resource "aws_ecr_repository" "api" {
  name                 = "api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  tags = {
    Name = "api"
  }
}

# ECS 自身がイメージ取得とログ書き込みに使う身分。アプリの SDK は使わない。
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "bun-api-server-demo-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# アプリが DynamoDB を呼ぶときに名乗る身分。一時キーは ECS が STS から取る。
resource "aws_iam_role" "task" {
  name               = "bun-api-server-demo-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "task_items" {
  name = "items"
  role = aws_iam_role.task.id

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

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/bun-api-server-demo/web"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/bun-api-server-demo/api"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = "bun-api-server-demo"

  tags = {
    Name = "bun-api-server-demo"
  }
}

# 1 タスクのコンテナはネットワークを共有する。両方を 3000 番では待てない。
resource "aws_ecs_task_definition" "app" {
  family                   = "bun-api-server-demo"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 3002
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = "3002" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "ITEMS_TABLE", value = aws_dynamodb_table.items.name },
      ]
      healthCheck = {
        command     = ["CMD", "bun", "-e", "const r = await fetch('http://127.0.0.1:3002/health'); if (!r.ok) process.exit(1)"]
        interval    = 10
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    },
    {
      name      = "web"
      image     = "${aws_ecr_repository.web.repository_url}:latest"
      essential = true
      dependsOn = [
        {
          containerName = "api"
          condition     = "HEALTHY"
        }
      ]
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = "3000" },
        { name = "HOSTNAME", value = "0.0.0.0" },
        { name = "API_URL", value = "http://127.0.0.1:3002" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.web.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "web" {
  name                              = "web"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.app.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = [aws_subnet.public_a.id]
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
}
