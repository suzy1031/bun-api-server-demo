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
