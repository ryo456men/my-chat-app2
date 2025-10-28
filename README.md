# Nezumiya Chat App

A real-time chat application with room support and password protection.

## Features
- Real-time messaging
- Private rooms with passwords
- Mobile-responsive design
- Share room links easily
- Connection status indicator

## Deployment
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

## Deploy to Render.com (Free)
1. Create account on render.com
2. New Web Service
3. Connect your GitHub repository
4. Settings:
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Auto Deploy: Yes

## Quick GitHub + Render deployment (step-by-step)
1. Initialize git and commit your project (from project root):

```powershell
git init
git add .
git commit -m "Initial chat app"
```

2. Create a GitHub repo and push:

```powershell
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

3. On Render.com: Create a new Web Service, connect the GitHub repo and set the build/start commands above. Render will provide a public URL supporting WebSockets.

Notes:
- Keep `server.js` listening on `process.env.PORT` (already configured). Render/Heroku will set the PORT env.
- If you want me to create the Git repo and push, I can generate the exact commands for you to run locally (I cannot push on your behalf).