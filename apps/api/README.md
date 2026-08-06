# Dictator API — Endpoint Reference

Base URL: `http://localhost:8000/api/v1`

## System
- `GET /health` — Service Health Check

## Projects
- `POST /api/v1/projects` — Create Project
- `GET /api/v1/projects` — List Projects
- `GET /api/v1/projects/:id` — Get Project Details
- `POST /api/v1/projects/:id/process` — Start Processing Pipeline

## Uploads
- `POST /api/v1/projects/:id/uploads` — Upload Media Files (multipart/form-data)

## Edit Plans
- `GET /api/v1/projects/:id/plan` — Get Edit Plan (query: `?revision=N`)
- `PUT /api/v1/projects/:id/plan` — Update Edit Plan (Human Edits)
- `GET /api/v1/projects/:id/plan/revisions` — List Plan Revision History

## Conversational Editing
- `GET /api/v1/projects/:id/chat` — Get Chat History
- `POST /api/v1/projects/:id/chat` — Send Edit Instruction (returns modified plan)

## Rendering
- `POST /api/v1/projects/:id/render` — Trigger Render (proxy or final)
- `GET /api/v1/projects/:id/renders/:renderId` — Get Render Status

## Jobs
- `GET /api/v1/jobs/:id` — Get Background Job Progress & Events
