# Pantry to Plate

A small web app that turns the fresh ingredients you have into a five-day meal plan. Type in what's in your kitchen, pick a diet, and get a plan that sticks to the spices you actually own.

I built this to learn cloud deployment end to end: source control, an automated pipeline, a serverless backend, and keeping secrets out of the code.

## What it does

- Takes today's fresh ingredients and builds a five-day plan (breakfast, lunch, dinner, or fewer meals per day)
- Diet options: Non-vegetarian, Vegetarian (includes dairy), Eggetarian, Vegan
- An "Anything to avoid?" box for dislikes and allergies
- Uses only a fixed list of staples (spices and basics) kept in the backend, and puts anything else on a shopping list instead of assuming it
- Breakfasts are smoothies or puddings
- Adds a short nutrition benefit and a pairing note to each meal (general information, not medical advice)

## How it works

`Browser (index.html)` → `Azure Static Web Apps` → `/api/plan (Azure Function)` → `Gemini API` → plan returns to the page

- **Frontend:** a single static page (`index.html`) with plain HTML, CSS and JavaScript
- **Backend:** an Azure Function (`api/src/functions/plan.js`, Node.js) builds the prompt, calls the Gemini API, and returns JSON to the page
- **Hosting:** Azure Static Web Apps, Free plan, with the API deployed as a managed Function
- **Deployment:** every push to `main` triggers a GitHub Actions workflow that builds and deploys the site
- **Secrets:** the API key is stored as an app setting in Azure (`GEMINI_API_KEY`), never in this repo

## Project structure

- `index.html` — the page and its styling
- `api/src/functions/plan.js` — the backend function, including the staples list and the prompt
- `api/package.json`, `api/host.json` — Azure Functions configuration
- `staticwebapp.config.json` — sets the Node.js runtime for the API
- `.github/workflows/` — the deployment pipeline created by Azure

## Setup notes

1. Create an Azure Static Web App connected to this repo (App location `/`, API location `api`).
2. Get a free Gemini API key from Google AI Studio.
3. In the Static Web App, add an environment variable named `GEMINI_API_KEY` with the key as its value.
4. Edit the `STAPLES` line near the top of `plan.js` to match your own kitchen.

## Problems I ran into and how I solved them

- Failed deployment: the pipeline stopped with "host.json could not be parsed". I read the build log from the bottom, found the malformed file, and replaced it with valid JSON.
- Region not supported: the AI provider rejected requests with "User location is not supported" because my Function was hosted in East Asia (Hong Kong). The Functions region can't be changed after creation, so I rebuilt the app in Central US.
- Function timeouts: Azure's managed Functions cut requests off at 45 seconds, and the AI sometimes took longer. I added shorter per-attempt timeouts, retries, and a fallback model.

## Limitations

- No login and no rate limiting, so anyone with the link shares one free API allowance
- Runs on a free AI tier, which has daily limits and may use inputs to improve the provider's products, so don't type anything private
- The AI can make mistakes; if you have a serious allergy, always check ingredients yourself

## Planned improvements

- Click a dish to open a detailed recipe, generated on demand
- Deploy the infrastructure with Bicep instead of the portal
- Add Application Insights for monitoring, and move the key to Key Vault

## About how this was built

I built this with an AI assistant helping to write the code. The deployment, debugging, configuration and design decisions were worked through step by step by me, and I'm using the project to learn to write more of the code myself.

Built by Madhu.
