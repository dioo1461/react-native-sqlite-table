# react-native-sqlite-table

**Type-safe SQLite table wrapper for React Native.**  
Built on top of [`react-native-sqlite-storage`](https://github.com/andpor/react-native-sqlite-storage), this library provides schema management, CRUD utilities, and React Hook support with full TypeScript integration.

## ✨ Features

- **Type-safe column definitions**  
  Define interfaces and column specs in one place, ensuring both runtime and compile-time validation.

- **Simple CRUD utilities**  
  Use `insert`, `update`, `delete`, `query`, and more with concise APIs.

- **Schema versioning & migration**  
  Manage table lifecycle automatically using `DDLOption`, with built-in version tracking and migrations.

- **React Hook support**  
  `useSQLiteTable` automatically handles DB open/close and keeps table instances stable across re-renders.

- **Advanced type support**  
  Built-in handling for `BLOB`, `BOOLEAN`, and automatic JSON serialization.

## 📱 Supported Platforms

| Platform | Support | Notes |
|----------|---------|-------|
| iOS      | ✅      | Fully supported |
| Android  | ✅      | Fully supported |
| Windows  | ✅      | Fully supported |
| macOS    | ✅      | Fully supported |

---


## 📦 Installation

```bash
npm install react-native-sqlite-table react-native-sqlite-storage
# or
yarn add react-native-sqlite-table react-native-sqlite-storage
```

> **Note:** `react` and `react-native` are peer dependencies and must already be installed.

## 🚀 Quick Start

### 1. Define columns & interface

```ts
// message.types.ts
export interface Message {
  roomId: string;
  text: string;
  timestamp: number;
  edited?: boolean;
}

export const messageColumns = {
  roomId: 'TEXT',
  text: { type: 'TEXT', nullable: false },
  timestamp: 'INTEGER',
  edited: { type: 'BOOLEAN', default: false },
};
```

> **Note:** `row_id` is a reserved auto-incrementing primary key (`INTEGER PRIMARY KEY AUTOINCREMENT`) managed by the library; do not include it in your column definitions.

### 2. Create and use table (class)

```ts
import { SQLiteTable } from 'react-native-sqlite-table';
import type { Message } from './message.types';

const table = new SQLiteTable<Message>(
  'MyAppSQLiteDB',        // Database file name
  'messages',             // Table name
  messageColumns,         // Column specs
  { version: 1 },         // (optional) DDL options
  true                    // (optional) Debug mode
);

await table.insert({
  roomId: 'lobby',
  text: 'Hello world!',
  timestamp: Date.now(),
});

const rows = await table.all();
console.log(rows);
```

### 3. Use `useSQLiteTable` Hook

```tsx
import React from 'react';
import { useSQLiteTable } from 'react-native-sqlite-table';
import { messageColumns, Message } from './message.types';

export function Chat() {
  const table = useSQLiteTable<Message>({
    tableName: 'messages',
    columns: messageColumns,
  });

  const send = async (text: string) => {
    await table.insert({ roomId: 'lobby', text, timestamp: Date.now() });
  };

  // DB connection is automatically closed when the component unmounts
  return <ChatUI onSend={send} />;
}
```

## 🗂 Column Spec Format

Each column can be defined as an object or shorthand string (`'TEXT'`, `'INTEGER'`, etc.).

| Property | Type                                         | Description                          |
|----------|----------------------------------------------|--------------------------------------|
| type     | `'TEXT' \| 'INTEGER' \| 'REAL' \| 'BOOLEAN' \| 'BLOB'` | SQLite column type (**required**)    |
| nullable | `boolean`                                    | Whether `NULL` values are allowed    |
| default  | `string \| number \| boolean \| object`      | Default value                        |
| unique   | `boolean`                                    | Create a unique index                |
| check    | `string`                                     | Add a `CHECK(...)` constraint        |

## ⚡ Schema & Migration

Use `DDLOption` for automated schema lifecycle management.

```ts
const chatDDL = {
  version: 2,
  beforeCreateNoTxn: [['PRAGMA auto_vacuum=INCREMENTAL']],
  afterCreateTxn: [
    ['CREATE INDEX IF NOT EXISTS idx_chat_room_ts ON messages(room_id, timestamp)']
  ],
  afterCreateNoTxn: [['PRAGMA journal_mode=WAL']],
  onEveryOpen: [['PRAGMA foreign_keys=ON']],
  migrationSteps: [
    {
      to: 2,
      txn: [['ALTER TABLE messages ADD COLUMN edited BOOLEAN DEFAULT 0']],
    }
  ]
};
```

- **version**: Target schema version (positive integer)  
- **beforeCreateNoTxn**: Commands before table creation (outside transaction)  
- **afterCreateTxn**: Commands after table creation (inside transaction)  
- **afterCreateNoTxn**: Commands after table creation (outside transaction)  
- **onEveryOpen**: Commands on every database open  
- **migrationSteps**: Define version upgrade steps  

## 📖 API Reference

### `SQLiteTable<T>`

| Method                           | Description                         |
|---------------------------------|-------------------------------------|
| `open()` / `close()`            | Open or close the database connection |
| `insert(row)` / `insertMany(rows)` | Insert rows                        |
| `update(where, changes)`        | Update rows matching condition      |
| `delete(where)`                  | Delete rows                        |
| `all()`                          | Fetch all rows                     |
| `findByKeyValue(obj)`           | Find by key-value pairs             |
| `query(sql, params?)`           | Run a custom SELECT query           |
| `queryWithPK(sql, params?)`     | SELECT query including `row_id`     |
| `run(sql, params?)`             | Run a custom non-SELECT query       |

### `useSQLiteTable<T>(options)`

React Hook that accepts:  
- `dbName`  
- `tableName`  
- `columns`  
- `ddlOption`  

It automatically opens/closes DB with the component lifecycle.


## 🧑‍💻 Additional Examples

### Update & Delete
```ts
// Update a message by rowId
await table.update({ row_id: 1 }, { text: 'Edited text', edited: true });

// Delete all messages in a room
await table.delete({ roomId: 'lobby' });
```

### Query
```ts
// Custom SELECT
const results = await table.query(
  'SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp DESC LIMIT ?',
  ['lobby', 50]
);
```

### Hook with Effect
```tsx
function ChatList() {
  const table = useSQLiteTable<Message>({
    tableName: 'messages',
    columns: messageColumns,
  });

  const [messages, setMessages] = React.useState<Message[]>([]);

  React.useEffect(() => {
    table.all().then(setMessages);
  }, [table]);

  return <MessageList data={messages} />;
}
```

---

## 🔄 Migration Example

```ts
const ddl = {
  version: 3,
  migrationSteps: [
    {
      to: 2,
      txn: [
        ['ALTER TABLE messages ADD COLUMN edited BOOLEAN DEFAULT 0']
      ]
    },
    {
      to: 3,
      txn: [
        ['ALTER TABLE messages ADD COLUMN sender TEXT'],
        ['CREATE INDEX IF NOT EXISTS idx_messages_room_sender ON messages(room_id, sender)']
      ]
    }
  ]
};
```

- **v1 → v2**: add `edited` column  
- **v2 → v3**: add `sender` column + index  

> ⚠️ Always test migration with existing data to avoid accidental loss.

---


## 🧩 TypeScript First-Class Support

<img width="835" height="290" alt="image" src="https://github.com/user-attachments/assets/7d6d65f8-fbb9-4a04-82bc-8321b00e4bcf" />

- Compiler ensures your TypeScript interface is consistent with the defined columns.
- Insert, update, and select queries are fully type-safe at compile time.
- Query results are automatically typed as your entity interface.
- *If you don’t pass a generic type, the type is still inferred automatically from the provided column definitions.*


## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome!  
Feel free to open issues or submit PRs for bug reports, feature requests, or improvements.
