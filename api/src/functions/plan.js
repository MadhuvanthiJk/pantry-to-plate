const { app } = require("@azure/functions");

app.http("plan", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { status: 500, jsonBody: { error: "Missing API key setting" } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: "Bad request" } }; }

    const ingredients = String(body.ingredients || "").slice(0, 1500);
    const diet = String(body.diet || "No restriction").slice(0, 40);
    const cuisine = String(body.cuisine || "Anything goes").slice(0, 40);
    const meals = ["1", "2", "3"].includes(String(body.meals)) ? String(body.meals) : "3";
    if (!ingredients.trim()) return { status: 400, jsonBody: { error: "No ingredients" } };

    const prompt = [
      "You are a practical home-cooking meal planner. Build a 5-day meal plan using mainly the ingredients the person has.",
      "Ingredients on hand: " + ingredients,
      "Diet: " + diet + ". Cuisine leaning: " + cuisine + ". Meals per day: " + meals + " (3 = breakfast, lunch, dinner; 2 = lunch and dinner; 1 = dinner only).",
      "Rules: vary the dishes across days, do not repeat a main dish, assume basic pantry staples (salt, oil, water, common spices) are available, and respect the diet strictly.",
      "Keep each tip to one short, useful sentence. In 'shopping' list at most 6 inexpensive extras that would unlock the plan; use an empty array if none are needed.",
      'Respond with ONLY JSON in this shape: {"days":[{"day":"Day 1","meals":[{"type":"Breakfast","dish":"...","uses":"comma separated ingredients from the list","tip":"..."}]}],"shopping":["..."]}. Exactly 5 days.'
    ].join("\n");

    const started = Date.now();
    let r;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } }
        }),
        signal: AbortSignal.timeout(30000)
      });
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 300);
      return { status: 504, jsonBody: { error: "No answer from Google in time", detail: msg, ms: Date.now() - started } };
    }

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 400);
      context.error(detail);
      return { status: 502, jsonBody: { error: "Upstream error", detail, ms: Date.now() - started } };
    }

    const data = await r.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    try { return { jsonBody: JSON.parse(clean) }; }
    catch { return { status: 502, jsonBody: { error: "Could not parse plan", detail: text.slice(0, 300), ms: Date.now() - started } }; }
  }
});
