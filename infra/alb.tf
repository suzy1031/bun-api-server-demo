# ブラウザからの入口。80 番だけを開け、HTTPS 用の証明書は付けない。
resource "aws_security_group" "alb" {
  name        = "bun-api-server-demo-alb"
  description = "HTTP from the operator IP to the ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from the operator"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    description     = "Next.js in the Fargate task"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.task.id]
  }

  tags = {
    Name = "bun-api-server-demo-alb"
  }
}

# タスク側は ALB からの 3000 番だけ受ける。3002 番は外に開けない。
# ingress は別リソースにして、ALB の egress との循環参照を避ける。
resource "aws_security_group" "task" {
  name        = "bun-api-server-demo-task"
  description = "Fargate task. Inbound only from the ALB"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS for ECR image pulls and CloudWatch Logs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # ECR のホスト名を引く。VPC の DNS はネットワークアドレス + 2。
  egress {
    description = "DNS to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["10.20.0.2/32"]
  }

  egress {
    description = "DNS to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["10.20.0.2/32"]
  }

  tags = {
    Name = "bun-api-server-demo-task"
  }
}

resource "aws_security_group_rule" "task_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.task.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  description              = "Next.js from the ALB"
}

resource "aws_lb" "web" {
  name                       = "bun-api-server-demo"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = [aws_subnet.public_a.id, aws_subnet.public_b.id]
  ip_address_type            = "ipv4"
  drop_invalid_header_fields = true
  enable_deletion_protection = false

  tags = {
    Name = "bun-api-server-demo"
  }
}

# 転送先は Next.js の 3000 番。Hono の 3002 番は登録しない。
resource "aws_lb_target_group" "web" {
  name        = "bun-api-server-demo-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name = "bun-api-server-demo-web"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
