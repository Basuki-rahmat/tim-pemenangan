@echo off
set MINIO_ROOT_USER=minioadmin
set MINIO_ROOT_PASSWORD=minioadmin
title MinIO S3 Local Server (API 9000 - Console 9001)
if not exist "C:\laragon\minio-data" mkdir "C:\laragon\minio-data"
echo ======================================================================
echo  MinIO Local S3-Compatible Server (Pengganti Biznet NOS di Localhost)
echo ======================================================================
echo  S3 API Endpoint : http://127.0.0.1:9000
echo  Web Console     : http://127.0.0.1:9001
echo  Username        : minioadmin
echo  Password        : minioadmin
echo ======================================================================
echo.
"C:\laragon\bin\minio\minio.exe" server "C:\laragon\minio-data" --console-address ":9001"
pause
