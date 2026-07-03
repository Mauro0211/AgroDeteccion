@echo off
start cmd /k "npm run dev"
start cmd /k "cd agrodeteccion-backend & env\Scripts\activate.bat & uvicorn main:app --reload --port 3001"