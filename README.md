<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/671fa885-23fc-4d45-a87b-acb1199395d0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the server-side assistant provider in [.env.local](.env.local): `AI_PROVIDER=glm`, `GLM_API_KEY`, `GLM_MODEL=glm-5.2`, and `GLM_BASE_URL=https://api.z.ai/api/paas/v4`
3. Run the app:
   `npm run dev`
