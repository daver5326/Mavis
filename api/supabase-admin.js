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

async function initializeDatabase() {
  await createMavisConfigTable();
  await insertLivingDocumentConfig();
}

initializeDatabase().catch(console.error);

export default supabaseAdmin;
```