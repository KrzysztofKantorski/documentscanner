#!/usr/bin/env bash
set -e

dotnet publish backend/DocumentScanner.API/DocumentScanner.API.csproj -c Release -o ./publish
(cd ./publish && zip -r ../backend-publish.zip .)
az webapp deploy --resource-group rg-documentscanner-prod --name documentscanner-backend-prod --src-path ./backend-publish.zip --type zip
rm -rf ./publish ./backend-publish.zip