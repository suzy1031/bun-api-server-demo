output "table_name" {
  value = aws_dynamodb_table.items.name
}

output "table_arn" {
  value = aws_dynamodb_table.items.arn
}

output "function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "alb_dns_name" {
  value = aws_lb.web.dns_name
}

output "ecr_web_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecr_api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}
