# Sharded Database Schema Design Document

## Overview

This document outlines the sharded database schema design for therev's enterprise architecture, supporting multi AI account management, data colocation, and scalable content delivery.

## Sharding Strategy

### Primary Sharding Keys

- **Users Database**: Sharded by `user_id` (UUID modulo operation)
- **Content Databases**: Sharded by `author_id` (data co-location with users)
- **AI Tasks Database**: Sharded by `user_id` (owner-based sharding)

### Shard Configuration

- **Total Shards**: 4 (configurable for scaling)
- **Shard Algorithm**: `hash(key) % shard_count`
- **Data Co-location**: User's content lives on same shard as user data

## Database Structure

### Shard 0: Users Database (Primary)

Contains user authentication, profiles, AI account configurations, and sessions.

### Shards 1-3: Content Databases

Contains threads, posts, and user-generated content, co-located with author data.

### Cross-Shard Reference Tables (Read Replicas)

Optimized lookup tables for user discovery and content search across shards.

## Key Features Implemented

### 1. Multi AI Account Support

- `user_ai_accounts` table manages multiple AI provider credentials
- Support for API keys and web automation accounts
- Rate limiting and health monitoring per provider

### 2. Data Co-location

- Content (threads, posts) stored on same shard as author
- Reduces cross shard queries for user specific operations
- Improves cache locality and performance

### 3. AI Task Management

- Complete task lifecycle tracking
- Intent classification and routing metadata
- Fallback strategy configuration
- Detailed audit logging

### 4. Cross Shard Optimization

- Directory tables for user discovery and content search
- Materialized views for common query patterns
- Triggers for maintaining directory consistency

### 5. Enterprise Features

- Comprehensive audit logging
- Provider health monitoring
- Rate limiting and quota management
- Session management across shards

## Schema Components

### Core Tables

- `users` - User profiles and authentication
- `user_ai_accounts` - Multi-AI account management
- `user_sessions` - Session management
- `threads` - Forum threads (co-located with author)
- `posts` - User posts and content (co-located with author)
- `ai_tasks` - AI task queue and management
- `ai_task_logs` - Detailed execution audit trail

### Reference Tables (Read Replicas)

- `user_directory` - Optimized user lookups
- `thread_directory` - Content discovery index

### Monitoring Tables

- `ai_provider_health` - AI provider status monitoring

## Performance Optimizations

### Indexing Strategy

- Shard-key indexes for fast data location
- Composite indexes for common query patterns
- Time-based indexes for audit logs

### Partitioning

- Time based partitioning for high volume tables (ai_task_logs)
- Monthly partitions for manageable data retention

### Materialized Views

- User AI account summaries
- AI task statistics and analytics

## Migration Strategy

### Dual-Write Phase

- Write to both single DB and sharded architecture
- Validate data consistency and performance
- Gradual traffic migration

### Cut over Phase

- Switch read operations to sharded architecture
- Maintain backup writes to single DB
- Monitor performance and consistency

### Cleanup Phase

- Remove dual write logic
- Decommission single database
- Optimize sharded performance

## Scalability Considerations

### Horizontal Scaling

- Easy addition of new shards
- Rebalancing tools for data distribution
- Hot user detection and migration

### Vertical Scaling

- Connection pooling per shard
- Read replicas for content discovery
- Redis caching for frequently accessed data

### Monitoring

- Per shard performance metrics
- Cross shard query analysis
- Hot spot detection and mitigation
