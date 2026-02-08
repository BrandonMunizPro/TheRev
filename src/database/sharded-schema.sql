

-- SHARDING STRATEGY OVERVIEW
-- Users table: SHARDED by user_id (primary sharding key)
-- Content tables (posts, threads): SHARDED by author_id (data co location)
-- AI tasks: SHARDED by user_id (owner based sharding)
-- Cross shard queries: handled by FeedService and ContentDiscoveryService


-- Users table with sharding metadata
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_name VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio TEXT,
    ideology VARCHAR(100),
    profile_pic_url VARCHAR(500),
    role user_role_enum DEFAULT 'STANDARD',
    
    -- Sharding metadata
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User AI accounts for multi-AI architecture
CREATE TABLE user_ai_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'chatgpt', 'claude', 'gemini', 'perplexity'
    account_type VARCHAR(20) NOT NULL, -- 'api', 'web_automation'
    credentials_encrypted JSONB NOT NULL, -- encrypted API keys/credentials
    is_active BOOLEAN DEFAULT true,
    rate_limit_remaining INTEGER DEFAULT 0,
    rate_limit_reset TIMESTAMP WITH TIME ZONE,
    last_used TIMESTAMP WITH TIME ZONE,
    preferences JSONB, -- user preferences for this AI provider
    
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(user_id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User session management for sharded environment
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(user_id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SHARD 1-3: CONTENT DATABASES (Co located with User Data)
-- =============================================================================

-- Threads table (co located with author)
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    author_id UUID NOT NULL,
    is_locked BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    
    -- Sharding key matches author's shard for data co-location
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(author_id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts table (co located with author)
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type post_type_enum NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    metadata JSONB, -- thumbnail, duration, provider for media posts
    author_id UUID NOT NULL,
    thread_id UUID NOT NULL,
    
    -- Sharding key matches author's shard for data co location
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(author_id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Main AI tasks table
CREATE TABLE ai_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    task_type VARCHAR(50) NOT NULL, -- 'automation', 'generation', 'analysis'
    intent_class VARCHAR(100) NOT NULL, -- 'write_post', 'summarize', 'navigate'
    priority INTEGER DEFAULT 5, -- 1-10 (1=highest)
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    
    -- Task routing information
    selected_ai_provider VARCHAR(50),
    selected_ai_account_id UUID,
    fallback_strategy JSONB, -- fallback chain if primary fails
    
    -- Task payload and results
    input_data JSONB NOT NULL,
    output_data JSONB,
    error_message TEXT,
    
    -- Execution metadata
    execution_duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Sharding by user_id for user data locality
    shard_key INTEGER NOT NULL GENERATED ALWAYS AS (hashtext(user_id::text) % 4) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI task audit log (detailed execution tracking)
CREATE TABLE ai_task_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL,
    log_level VARCHAR(10) NOT NULL, -- 'INFO', 'WARN', 'ERROR', 'DEBUG'
    message TEXT NOT NULL,
    details JSONB, -- structured log data
    
    -- Execution context
    provider_used VARCHAR(50),
    account_id UUID,
    step_number INTEGER,
    step_name VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI provider health monitoring
CREATE TABLE ai_provider_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    account_id UUID,
    status VARCHAR(20) NOT NULL, -- 'healthy', 'degraded', 'down'
    last_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_rate_5min DECIMAL(5,4), -- error rate in last 5 minutes
    avg_response_time_ms INTEGER,
    consecutive_failures INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- CROSS SHARD REFERENCE TABLES (Read Replicas)
-- =============================================================================

-- User directory for cross shard lookups (read optimized)
CREATE TABLE user_directory (
    user_id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(500) NOT NULL, -- first_name || ' ' || last_name
    profile_pic_url VARCHAR(500),
    role user_role_enum NOT NULL,
    shard_key INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thread directory for content discovery (read optimized)
CREATE TABLE thread_directory (
    thread_id UUID PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author_id UUID NOT NULL,
    author_username VARCHAR(255) NOT NULL,
    author_shard_key INTEGER NOT NULL,
    post_count INTEGER DEFAULT 0,
    is_locked BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    
    shard_key INTEGER NOT NULL, -- thread's shard
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR SHARDED PERFORMANCE
-- =============================================================================

-- Users indexes
CREATE INDEX idx_users_shard_key ON users(shard_key);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(user_name);

-- AI accounts indexes
CREATE INDEX idx_user_ai_accounts_user_id ON user_ai_accounts(user_id);
CREATE INDEX idx_user_ai_accounts_provider ON user_ai_accounts(provider);
CREATE INDEX idx_user_ai_accounts_shard_key ON user_ai_accounts(shard_key);

-- Sessions indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Content indexes (shard local for performance)
CREATE INDEX idx_threads_author_id ON threads(author_id);
CREATE INDEX idx_threads_shard_key ON threads(shard_key);
CREATE INDEX idx_threads_created_at ON threads(created_at);

CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_thread_id ON posts(thread_id);
CREATE INDEX idx_posts_shard_key ON posts(shard_key);
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- AI tasks indexes
CREATE INDEX idx_ai_tasks_user_id ON ai_tasks(user_id);
CREATE INDEX idx_ai_tasks_status ON ai_tasks(status);
CREATE INDEX idx_ai_tasks_priority ON ai_tasks(priority);
CREATE INDEX idx_ai_tasks_shard_key ON ai_tasks(shard_key);
CREATE INDEX idx_ai_tasks_created_at ON ai_tasks(created_at);

-- AI task logs indexes
CREATE INDEX idx_ai_task_logs_task_id ON ai_task_logs(task_id);
CREATE INDEX idx_ai_task_logs_created_at ON ai_task_logs(created_at);

-- Cross shard directory indexes (read replicas)
CREATE INDEX idx_user_directory_username ON user_directory(username);
CREATE INDEX idx_user_directory_shard_key ON user_directory(shard_key);
CREATE INDEX idx_thread_directory_author ON thread_directory(author_id);
CREATE INDEX idx_thread_directory_activity ON thread_directory(last_activity DESC);

-- =============================================================================
-- TRIGGERS FOR CROSS SHARD CONSISTENCY
-- =============================================================================

-- Update user directory when user changes
CREATE OR REPLACE FUNCTION update_user_directory()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_directory (user_id, username, display_name, profile_pic_url, role, shard_key, last_updated)
    VALUES (NEW.id, NEW.user_name, NEW.first_name || ' ' || NEW.last_name, NEW.profile_pic_url, NEW.role, NEW.shard_key, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        username = NEW.user_name,
        display_name = NEW.first_name || ' ' || NEW.last_name,
        profile_pic_url = NEW.profile_pic_url,
        role = NEW.role,
        last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_directory
    AFTER INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_user_directory();

-- Update thread directory when thread changes
CREATE OR REPLACE FUNCTION update_thread_directory()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO thread_directory (thread_id, title, author_id, author_username, author_shard_key, shard_key, created_at, last_activity)
    VALUES (NEW.id, NEW.title, NEW.author_id, 
            (SELECT user_name FROM users WHERE id = NEW.author_id),
            (SELECT shard_key FROM users WHERE id = NEW.author_id),
            NEW.shard_key, NEW.created_at, NEW.updated_at)
    ON CONFLICT (thread_id)
    DO UPDATE SET
        title = NEW.title,
        last_activity = NEW.updated_at;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_directory
    AFTER INSERT OR UPDATE ON threads
    FOR EACH ROW EXECUTE FUNCTION update_thread_directory();

-- PARTITIONING STRATEGY FOR LARGE TABLES
-- Partition ai_task_logs by time for better performance
CREATE TABLE ai_task_logs_partitioned (
    LIKE ai_task_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (example for current month)
CREATE TABLE ai_task_logs_y2024m01 PARTITION OF ai_task_logs_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- User with AI accounts view
CREATE VIEW user_ai_summary AS
SELECT 
    u.id,
    u.user_name,
    u.first_name,
    u.last_name,
    u.email,
    u.role,
    COUNT(uaa.id) as ai_account_count,
    ARRAY_AGG(DISTINCT uaa.provider) as ai_providers
FROM users u
LEFT JOIN user_ai_accounts uaa ON u.id = uaa.user_id AND uaa.is_active = true
GROUP BY u.id, u.user_name, u.first_name, u.last_name, u.email, u.role;

-- AI task statistics view
CREATE VIEW ai_task_stats AS
SELECT 
    user_id,
    status,
    selected_ai_provider,
    COUNT(*) as task_count,
    AVG(execution_duration_ms) as avg_duration_ms,
    COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count
FROM ai_tasks
GROUP BY user_id, status, selected_ai_provider;