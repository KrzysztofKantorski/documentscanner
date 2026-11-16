terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "rg" {
  name     = "rg-documentscanner-prod"
  location = "West Europe"
}

resource "azurerm_service_plan" "backend_plan" {
  name                = "plan-backend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "backend" {
  name                = "documentscanner-backend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.backend_plan.location
  service_plan_id     = azurerm_service_plan.backend_plan.id

  site_config {
    application_stack {
      dotnet_version = "10.0"
    }
  }
}

resource "azurerm_static_site" "frontend" {
  name                = "documentscanner-frontend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku_tier            = "Free"
  sku_size            = "Free"
}

output "backend_url" {
  value = azurerm_linux_web_app.backend.default_hostname
}

output "frontend_url" {
  value = azurerm_static_site.frontend.default_host_name
}