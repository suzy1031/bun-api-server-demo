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

variable "allowed_cidr" {
  type        = string
  description = "Single IPv4 address allowed to open the ALB on port 80, written as a /32 CIDR"

  validation {
    condition     = can(cidrhost(var.allowed_cidr, 0)) && endswith(var.allowed_cidr, "/32")
    error_message = "allowed_cidr must be an IPv4 /32 CIDR, for example 203.0.113.4/32."
  }
}
