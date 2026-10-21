variable "aws_region" {
  type        = string
  description = "Region for the items table"
  default     = "ap-northeast-1"
}

variable "table_name" {
  type        = string
  description = "DynamoDB table name"
  default     = "items"
}

variable "function_name" {
  type        = string
  description = "Lambda function name"
  default     = "bun-api"
}
