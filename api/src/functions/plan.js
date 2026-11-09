const { app } = require("@azure/functions");

// EDIT THIS LIST: your own staples (always at home), separated by commas.
// The planner will use only these plus the fresh ingredients typed on the page.
const STAPLES = "salt, olive oil, cloves, bay leaf, urad dal, elachi, sesame oil, star anise, cinnamon, coconut oil, groundnut oil, cumin powder, kasuri methi, white sesame seeds, cornflour, chilli flakes, mixed herbs, dried red chillies, turmeric, red chilli powder, coriander powder, cumin seeds, mustard seeds, black pepper, ginger-garlic paste, chilli oil, milk, butter, cheese, tamarind, wheat flour, ghee, garam masala";

app.http("plan", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { status: 500, jsonBody: { error: "Missing API key setting" } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: "Bad request" } }; }

    const ingredients = String(body.ingredients || "").slice(0, 1500);
    const avoid = String(body.avoid || "").slice(0, 200);
    const diet = String(body.diet || "Non-vegetarian").slice(0, 40);
    const cuisine = String(body.cuisine || "Anything goes").slice(0, 40);
    const meals = ["1", "2", "3"].includes(String(body.meals)) ? String(body.meals) : "3";
    if (!ingredients.trim()) return { status: 400, jsonBody: { error: "No ingredients" } };

    const prompt = [
      "You are a practical home-cooking meal planner. Build a 5-day meal plan around the fresh ingredients the person has.",
      "Fresh ingredients on hand (build the meals around these): " + ingredients,
      "Diet: " + diet + ". Cuisine leaning: " + cuisine + ". Meals per day: " + meals + " (3 = breakfast, lunch, dinner; 2 = lunch and dinner; 1 = dinner only).",
      "Rules: vary the dishes across days, do not repeat a main dish, and respect the diet strictly. Water is always available.",
      "Diet meanings: Vegetarian = only plant-based food (vegetables, leafy greens, roots, fruits, grains, pulses, nuts) plus dairy (milk, curd, paneer, ghee); no meat, poultry, fish, seafood or eggs. Eggetarian = vegetarian food with eggs as a prominent protein in many meals; no meat, poultry, fish or seafood. Non-vegetarian = meat, poultry, seafood, pork, beef, ham, sausages and every other non-vegetarian food is allowed, along with vegetarian food. Vegan = no animal products at all (no meat, fish, eggs, dairy or honey).",
      STAPLES.trim()
        ? "The person's complete list of staples at home: " + STAPLES + ". Use these freely for cooking and seasoning, but do not treat them as the main ingredients. Do NOT assume they have any other spice, sauce, oil or pantry item beyond this list and the fresh ingredients given. If a dish needs anything else, either choose a different dish or add that item to the shopping list. Never put the listed staples in the shopping list."
        : "Beyond the fresh ingredients, assume only salt, oil and water are available.",
      avoid.trim()
        ? "The person wants to avoid: " + avoid + ". Never use these ingredients, and never put them in the shopping list."
        : "Nothing specific to avoid.",
      "Breakfast rule: whenever a Breakfast is included, it must be either a smoothie or a pudding (for example chia pudding, oats pudding, rice pudding), never a savoury dish. Alternate between smoothies and puddings and never repeat the same one. If the pantry lacks what they need, add the missing items to the shopping list.",
      "Keep each tip under 12 words. In 'shopping' list at most 8 inexpensive extras that would unlock the plan; use an empty array if none are needed.",
      "For each meal also give a 'benefit': one short, modest, factual line (under 14 words) about a nutritional plus of the dish, such as fibre, protein, iron or vitamin C. No medical claims and no promises about weight loss or curing anything.",
      "For each meal also give 'avoid_with': a short line (under 16 words) naming something not to have at the same meal, but ONLY when there is a well-established nutrition reason, such as tea, coffee or calcium-rich dairy at the same meal as iron-rich foods, which can reduce iron absorption. Use cautious wording like 'can reduce', never absolutes. If there is no well-established interaction, use an empty string. Never invent folk food-combining rules and make no medical claims.",
      'Respond with ONLY JSON in this shape: {"days":[{"day":"Day 1","meals":[{"type":"Breakfast","dish":"...","uses":"comma separated ingredients from the lists","tip":"..."}]}],"shopping":["..."]}. Exactly 5 days.'
    ].join("\n");

    const models = ["gemini-3.1-flash-lite-preview", "gemini-3.8-flash"];
    const started = Date.now();
    const deadline = started + 38000;
    const tried = [];
    let r = null;
    let lastDetail = "";

    for (let i = 0; i < 4; i++) {
      const left = deadline - Date.now();
      if (left < 4000) break;
      const model = models[i % models.length];
      try {
        r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } }
          }),
          signal: AbortSignal.timeout(Math.min(14000, left))
        });
      } catch (e) {
        tried.push(model + ": timeout");
        lastDetail = String((e && e.message) || e).slice(0, 200);
        r = null;
        continue;
      }
      if (r.ok) break;
      const t = (await r.text()).slice(0, 300);
      tried.push(model + ": " + r.status);
      lastDetail = t;
      context.error(model + " " + r.status + " " + t);
      const retryable = [404, 429, 500, 503, 504].includes(r.status);
      if (!retryable) break;
      await new Promise(res => setTimeout(res, 1000));
    }

    if (!r || !r.ok) {
      return { status: 502, jsonBody: { error: "Upstream error", tried, detail: lastDetail, ms: Date.now() - started } };
    }

    const data = await r.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    try { return { jsonBody: JSON.parse(clean) }; }
    catch { return { status: 502, jsonBody: { error: "Could not parse plan", detail: text.slice(0, 300), ms: Date.now() - started } }; }
  }
});
