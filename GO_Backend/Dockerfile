FROM golang:1.20-alpine AS builder

WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN go build -o bin/matcher cmd/matcher/main.go
RUN go build -o bin/verifier cmd/verifier/main.go
RUN go build -o bin/importer cmd/importer/main.go
RUN go build -o bin/dedup cmd/dedup/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/bin /app/bin
CMD ["/app/bin/matcher"]
