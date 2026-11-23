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
  location = "swedencentral"
}

resource "azurerm_service_plan" "backend_plan" {
  name                = "plan-backend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_user_assigned_identity" "backend_identity" {
  name                = "id-documentscanner-backend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
}

resource "azurerm_linux_web_app" "backend" {
  name                = "documentscanner-backend-prod"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.backend_plan.location
  service_plan_id     = azurerm_service_plan.backend_plan.id

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.backend_identity.id]
  }

  app_settings = {
    "DocIntelligence__Endpoint" = azurerm_cognitive_account.doc_intelligence.endpoint
    "OpenAI__Endpoint"         = azurerm_cognitive_account.openai.endpoint
    "AZURE_CLIENT_ID"           = azurerm_user_assigned_identity.backend_identity.client_id
  }

  site_config {
    application_stack {
      dotnet_version = "10.0"
    }
  }

  depends_on = [azurerm_user_assigned_identity.backend_identity]
}

resource "azurerm_cognitive_account" "doc_intelligence" {
  name                  = "cog-documentscanner-prod"
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  kind                  = "FormRecognizer"
  sku_name              = "F0"
  custom_subdomain_name = "cog-documentscanner-prod"
}

resource "azurerm_cognitive_account" "openai" {
  name                  = "oai-documentscanner-prod"
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = "oai-documentscanner-prod"
}

resource "azurerm_role_assignment" "backend_doc_intelligence_user" {
  scope                = azurerm_cognitive_account.doc_intelligence.id
  role_definition_name = "Cognitive Services User"
  principal_id         = azurerm_user_assigned_identity.backend_identity.principal_id
}

resource "azurerm_role_assignment" "backend_openai_user" {
  scope                = azurerm_cognitive_account.openai.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = azurerm_user_assigned_identity.backend_identity.principal_id
}

output "backend_url" {
  value = azurerm_linux_web_app.backend.default_hostname
}

output "backend_identity_client_id" {
  value = azurerm_user_assigned_identity.backend_identity.client_id
}