FROM postgres:16-alpine

ENV TZ=Asia/Kolkata
COPY init.sql /docker-entrypoint-initdb.d/01-schema.sql

EXPOSE 5432
