# TaskFlow — Personal Task & Productivity Management System

TaskFlow is a Personal Task and Productivity Management System built with **HTML5**, **CSS3**, **Vanilla JavaScript**, **Node.js**, **Express.js**, and **SQLite (`better-sqlite3`)**.

## Technology Stack

- **Frontend**: Semantic HTML5, responsive CSS3 (custom properties, dual light/dark theme, tabular numerals), modular ES6 Vanilla JavaScript
- **Backend**: Node.js, Express.js REST API
- **Database**: SQLite via `better-sqlite3` (WAL mode, foreign keys, `NOT NULL` and `CHECK` constraints, parameterized prepared statements)
- **Testing**: Node.js built-in test runner (`node:test`)

## Architecture

```text
taskflow/
├── public/
│   ├── index.html
│   ├── pages/
│   │   ├── dashboard.html
│   │   ├── tasks.html
│   │   ├── board.html
│   │   ├── reports.html
│   │   └── settings.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── api.js
│   │   ├── modal.js
│   │   ├── utils.js
│   │   ├── main.js
│   │   └── views/
│   │       ├── dashboardView.js
│   │       ├── tasksView.js
│   │       ├── boardView.js
│   │       ├── reportsView.js
│   │       └── settingsView.js
│   └── assets/
│       └── favicon.svg
├── src/
│   ├── config/
│   │   └── database.js
│   ├── routes/
│   │   ├── taskRoutes.js
│   │   ├── dashboardRoutes.js
│   │   └── settingsRoutes.js
│   ├── controllers/
│   │   ├── taskController.js
│   │   ├── dashboardController.js
│   │   └── settingsController.js
│   ├── services/
│   │   └── taskService.js
│   ├── repositories/
│   │   └── taskRepository.js
│   ├── validators/
│   │   └── taskValidator.js
│   └── app.js
├── database/
│   └── taskflow.db
├── tests/
│   └── api.test.js
├── server.js
└── package.json
```

## REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tasks` | Retrieve tasks (supports `search`, `status`, `priority`, `category`, `overdue`, `sortBy`, `sortOrder`) |
| `GET` | `/api/tasks/:id` | Retrieve a single task by ID |
| `POST` | `/api/tasks` | Create a new validated task |
| `PUT` | `/api/tasks/:id` | Update an existing task |
| `DELETE` | `/api/tasks/:id` | Delete a task by ID |
| `DELETE` | `/api/tasks/completed` | Clear completed tasks |
| `GET` | `/api/dashboard` | Retrieve dashboard KPIs, weekly trends, priority & category breakdowns, and recent activity |
| `GET` | `/api/settings` | Retrieve persisted user preferences |
| `PUT` | `/api/settings` | Save user preferences (theme, display name, default category/priority, weekly goal) |

## Scripts

- `npm run dev` / `npm start` — Start Express server on port `3000`
- `npm test` — Execute the automated API, validation, and SQLite persistence test suite
- `npm run build` — Verify syntax and run automated test suite
