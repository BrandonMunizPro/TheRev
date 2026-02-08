-- Enum Types for Sharded Database

-- User role enum (existing)
CREATE TYPE user_role_enum AS ENUM ('STANDARD', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- Post type enum (existing)
CREATE TYPE post_type_enum AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'LINK', 'POLL', 'AI_GENERATED');

-- AI task status enum
CREATE TYPE ai_task_status_enum AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'retrying');

-- AI task type enum
CREATE TYPE ai_task_type_enum AS ENUM ('automation', 'generation', 'analysis', 'summarization', 'navigation', 'form_filling');

-- AI provider enum
CREATE TYPE ai_provider_enum AS ENUM ('chatgpt', 'claude', 'gemini', 'perplexity', 'open_source', 'deterministic');

-- AI account type enum
CREATE TYPE ai_account_type_enum AS ENUM ('api', 'web_automation', 'local_model');

-- AI intent class enum
CREATE TYPE ai_intent_class_enum AS ENUM (
    'write_post', 'reply_to_post', 'summarize_thread', 'analyze_sentiment',
    'navigate_to_thread', 'fill_form', 'search_content', 'generate_media',
    'moderate_content', 'extract_data', 'translate_text', 'code_assistance'
);

-- AI log level enum
CREATE TYPE ai_log_level_enum AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');

-- AI provider health status enum
CREATE TYPE ai_provider_health_enum AS ENUM ('healthy', 'degraded', 'down', 'maintenance');

-- Session status enum
CREATE TYPE session_status_enum AS ENUM ('active', 'expired', 'revoked', 'suspended');


CREATE TYPE content_moderation_enum AS ENUM ('approved', 'pending', 'rejected', 'flagged');