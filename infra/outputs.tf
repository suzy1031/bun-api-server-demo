output "table_name" {
  value = aws_dynamodb_table.items.name
}

output "table_arn" {
  value = aws_dynamodb_table.items.arn
}

output "function_url" {
  value = aws_lambda_function_url.api.function_url
}
