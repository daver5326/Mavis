```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase URL or Service Role Key');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function executeSQL(sqlString) {
  try {
    if (!sqlString || typeof sqlString !== 'string') {
      throw new Error('Invalid SQL string parameter');
    }

    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: sqlString
    });

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error executing SQL:', error);
    return { data: null, error: error.message };
  }
}

export async function readTable(tableName, filters = {}) {
  try {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }

    let query = supabaseAdmin.from(tableName).select('*');

    if (filters.eq) {
      Object.entries(filters.eq).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
    }

    if (filters.neq) {
      Object.entries(filters.neq).forEach(([column, value]) => {
        query = query.neq(column, value);
      });
    }

    if (filters.gt) {
      Object.entries(filters.gt).forEach(([column, value]) => {
        query = query.gt(column, value);
      });
    }

    if (filters.gte) {
      Object.entries(filters.gte).forEach(([column, value]) => {
        query = query.gte(column, value);
      });
    }

    if (filters.lt) {
      Object.entries(filters.lt).forEach(([column, value]) => {
        query = query.lt(column, value);
      });
    }

    if (filters.lte) {
      Object.entries(filters.lte).forEach(([column, value]) => {
        query = query.lte(column, value);
      });
    }

    if (filters.like) {
      Object.entries(filters.like).forEach(([column, value]) => {
        query = query.like(column, value);
      });
    }

    if (filters.in) {
      Object.entries(filters.in).forEach(([column, values]) => {
        query = query.in(column, values);
      });
    }

    if (filters.order) {
      const { column, ascending = true } = filters.order;
      query = query.order(column, { ascending });
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error reading from table:', error);
    return { data: null, error: error.message };
  }
}

export async function writeTable(tableName, data) {
  try {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }

    if (!data) {
      throw new Error('Data is required');
    }

    const { data: insertedData, error } = await supabaseAdmin
      .from(tableName)
      .insert(data)
      .select();

    if (error) {
      throw error;
    }

    return { data: insertedData, error: null };
  } catch (error) {
    console.error('Error writing to table:', error);
    return { data: null, error: error.message };
  }
}

export async function updateTable(tableName, id, data) {
  try {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }

    if (!id) {
      throw new Error('ID is required');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data parameter');
    }

    const { data: updatedData, error } = await supabaseAdmin
      .from(tableName)
      .update(data)
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    return { data: updatedData, error: null };
  } catch (error) {
    console.error('Error updating table:', error);
    return { data: null, error: error.message };
  }
}

export async function deleteFromTable(tableName, id) {
  try {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }

    if (!id) {
      throw new Error('ID is required');
    }

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error deleting from table:', error);
    return { data: null, error: error.message };
  }
}

export async function createTable(tableName, schema) {
  try {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Invalid table name');
    }

    if (!schema || typeof schema !== 'object') {
      throw new Error('Invalid schema parameter');
    }

    const columns = Object.entries(schema)
      .map(([columnName, columnDef]) => {
        let columnSpec = `${columnName} ${columnDef.type || 'TEXT'}`;
        
        if (columnDef.primaryKey) {
          columnSpec += ' PRIMARY KEY';
        }
        
        if (columnDef.unique) {
          columnSpec += ' UNIQUE';
        }
        
        if (columnDef.notNull) {
          columnSpec += ' NOT NULL';
        }
        
        if (columnDef.default !== undefined) {
          columnSpec += ` DEFAULT ${columnDef.default}`;
        }
        
        return columnSpec;
      })
      .join(', ');

    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;

    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: createTableQuery
    });

    if (error) {
      throw error;
    }

    return { data: { success: true, tableName }, error: null };
  } catch (error) {
    console.error('Error creating table:', error);
    return { data: null, error: error.message };
  }
}

export async function createMavisConfigTable() {
  const sql = 'CREATE TABLE IF NOT EXISTS mavis_config (id serial primary key, key text unique, value text, updated_at timestamptz default now())';
  return await executeSQL(sql);
}

export async function insertLivingDocumentConfig() {
  try {
    const { data, error } = await supabaseAdmin
      .from('mavis_config')
      .insert({
        key: 'living_document',
        value: 'placeholder — to be updated with full living document content'
      })
      .select();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error inserting living document config:', error);
    return { data: null, error: error.message };
  }
}

export async function updateConfig(key, value) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key parameter');
    }

    if (value === undefined || value === null) {
      throw new Error('Value is required');
    }

    const { data, error } = await supabaseAdmin
      .from('mavis_config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating config:', error);
    return { data: null, error: error.message };
  }
}

async function initializeDatabase() {
  await createMavisConfigTable();
  await insertLivingDocumentConfig();
  
  await updateConfig('living_document', `# Mavis Living Document

## Overview
Mavis is an AI-powered assistant designed to help David manage and analyze his digital presence across multiple platforms, including email, calendar, social media, and productivity tools.

## Core Capabilities

### 1. Multi-Platform Integration
- **Email Management**: Gmail integration for reading, composing, and organizing emails
- **Calendar**: Google Calendar integration for scheduling and event management
- **Social Media**: Twitter/X integration for posting and engagement
- **Task Management**: Integration with productivity tools
- **File Storage**: Google Drive integration for document management

### 2. Intelligent Analysis
- Sentiment analysis of communications
- Priority detection and flagging
- Content categorization and tagging
- Trend identification across platforms
- Relationship mapping and contact insights

### 3. Proactive Assistance
- Smart notifications and alerts
- Automated routine task handling
- Suggested responses and actions
- Meeting preparation and follow-ups
- Content drafting and editing assistance

### 4. Privacy & Security
- End-to-end encryption for sensitive data
- User-controlled data access and permissions
- Transparent logging of all AI actions
- GDPR and privacy regulation compliance
- Secure authentication via OAuth 2.0

## Technical Architecture

### Frontend
- **Framework**: Next.js 14 with App Router
- **UI Library**: React with Tailwind CSS
- **State Management**: React Context + hooks
- **Authentication**: Supabase Auth

### Backend
- **Database**: Supabase (PostgreSQL)
- **API**: Next.js API routes
- **AI Processing**: OpenAI GPT-4 integration
- **External APIs**: Google APIs, Twitter API

### Infrastructure
- **Hosting**: Vercel
- **Database**: Supabase cloud
- **File Storage**: Supabase Storage
- **Environment**: Node.js runtime

## Data Models

### User Profile
- Basic information (name, email, preferences)
- Connected accounts and OAuth tokens
- Settings and customization options
- Usage statistics and activity logs

### Communications
- Email threads and messages
- Calendar events and meetings
- Social media posts and interactions
- Task items and project data

### AI Context
- Conversation history
- Learning preferences
- Behavioral patterns
- Custom instructions and rules

## User Experience Principles

### 1. Transparency
- Always explain what Mavis is doing and why
- Provide clear attribution for AI-generated content
- Show confidence levels for suggestions
- Allow users to review before taking actions

### 2. Control
- User approval required for sensitive operations
- Easy undo/redo functionality
- Granular permission settings
- Ability to override AI decisions

### 3. Efficiency
- Minimize clicks and navigation
- Smart defaults based on context
- Keyboard shortcuts for power users
- Batch operations where appropriate

### 4. Learning
- Adapt to user preferences over time
- Improve suggestions based on feedback
- Remember user corrections
- Personalize communication style

## Development Roadmap

### Phase 1: Foundation (Current)
- Basic email integration
- Simple calendar viewing
- Twitter posting capability
- Core AI chat interface
- User authentication

### Phase 2: Intelligence
- Advanced email categorization
- Smart scheduling suggestions
- Content generation tools
- Multi-platform search
- Analytics dashboard

### Phase 3: Automation
- Workflow automation
- Scheduled tasks and reminders
- Auto-responses and templates
- Integration with webhooks
- Custom AI agents for specific tasks

### Phase 4: Expansion
- Additional platform integrations
- Team collaboration features
- API for third-party developers
- Mobile applications
- Voice interface

## Best Practices

### Code Quality
- TypeScript for type safety
- Comprehensive error handling
- Unit and integration tests
- Code documentation
- Performance monitoring

### Security
- Secure token storage
- Rate limiting on API calls
- Input validation and sanitization
- Regular security audits
- Dependency updates

### AI Interaction
- Clear prompt engineering
- Context window management
- Fallback strategies
- Cost optimization
- Quality assurance checks

## Configuration

### Environment Variables
\`\`\`
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>
OPENAI_API_KEY=<openai-key>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
TWITTER_API_KEY=<twitter-key>
TWITTER_API_SECRET=<twitter-secret>
\`\`\`

### Database Schema
- \`users\`: User profiles and settings
- \`oauth_tokens\`: Encrypted API tokens
- \`conversations\`: AI chat history
- \`emails\`: Cached email data
- \`events\`: Calendar events
- \`posts\`: Social media content
- \`mavis_config\`: System configuration

## Support & Maintenance

### Monitoring
- Error tracking with Sentry
- Performance metrics
- API usage statistics
- User engagement analytics

### Updates
- Regular dependency updates
- Security patches
- Feature releases
- Bug fixes

### User Support
- In-app help documentation
- Email support
- Feedback collection
- Feature request tracking

## Future Considerations

### AI Advancements
- Integration with multiple LLM providers
- Fine-tuned models for specific tasks
- Local AI processing options
- Multimodal capabilities (voice, images)

### Platform Expansion
- Slack integration
- GitHub integration
- Notion integration
- CRM system integration
- Custom plugin system

### Enterprise Features
- Team workspaces
- Admin dashboards
- Usage quotas and billing
- White-label options
- SLA guarantees

---

*This living document is continuously updated to reflect the current state and future direction of the Mavis project. Last updated: ${new Date().toISOString()}*`);
}

initializeDatabase().catch(console.error);

export default supabaseAdmin;
```