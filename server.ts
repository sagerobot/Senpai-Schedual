import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";

const CACHE_FILE = path.join(process.cwd(), "ai_summary_cache.json");

// Read cache initially
let aiSummaryCache: Record<string, string> = {};
async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    aiSummaryCache = JSON.parse(data);
  } catch (err) {
    // If file doesn't exist, ignore
  }
}
async function saveCache() {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(aiSummaryCache, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving cache", err);
  }
}

async function startServer() {
  await loadCache();
  
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // API Route for AI Summary
  app.post("/api/generate-summary", async (req, res) => {
    try {
      const { showId, synopses } = req.body;
      
      if (!showId || !synopses) {
        return res.status(400).json({ error: "Missing showId or synopses" });
      }

      if (aiSummaryCache[showId]) {
        return res.json({ summary: aiSummaryCache[showId] });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ summary: "Summary unavailable because GEMINI_API_KEY is not configured." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a concise anime summarizer. Given the following premise synopses from different sources for a show, write a spoiler-free summary describing the setup, tone, and appeal in 2-3 sentences. NEVER reveal plot developments, twists, deaths, or major reveals.
      
Synopses:
${synopses}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt
      });
      
      const summary = response.text?.trim() || "Summary unavailable";
      
      aiSummaryCache[showId] = summary;
      await saveCache();
      
      res.json({ summary });
    } catch (err) {
      console.error("AI Generation Error:", err);
      res.json({ summary: "Summary unavailable due to AI limits." });
    }
  });

  // API Route for Reddit Community Vibe Check
  app.post("/api/community-vibe", async (req, res) => {
    try {
      const { showId, episodeNumber, title, forceRefresh } = req.body;
      
      if (!showId || !episodeNumber || !title) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const cacheKey = `vibe_${showId}_ep${episodeNumber}`;
      if (aiSummaryCache[cacheKey] && !forceRefresh) {
        return res.json(aiSummaryCache[cacheKey]);
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ summary: "Vibe check unavailable because GEMINI_API_KEY is not configured.", goods: [], bads: [], indicator: "mixed", upvotes: 0, comments: 0, url: "" });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      let parsedResult: any = {
         summary: "No discussion threads found yet. The episode may not have aired, or the community hasn't started discussing it.",
         goods: [],
         bads: [],
         indicator: "mixed",
         upvotes: 0,
         comments: 0,
         url: `https://www.reddit.com/r/anime/search?q=${encodeURIComponent(title + " episode " + episodeNumber)}`
      };
      
      const prompt = `Search the web for the Reddit discussion thread of the anime "${title}" Episode ${episodeNumber} on r/anime. 
Read the community reactions and summarize the overall sentiment and tone. 
MUST BE SPOILER-FREE. Describe *how* fans reacted.
If no thread is found or the episode is not out yet, set summary to "No discussion threads found yet. The episode may not have aired, or the community hasn't started discussing it.", goods and bads to empty arrays, and indicator to "mixed".

Return the result STRICTLY as a JSON object matching this schema, DO NOT wrap it in markdown code blocks, just raw JSON:
{
  "summary": "2 sentences describing how people felt",
  "goods": ["short bullet 1", "short bullet 2"],
  "bads": ["short bullet 1", "short bullet 2"],
  "indicator": "positive" | "mixed" | "negative",
  "upvotes": 1234, // approximate upvotes of the reddit post (0 if none)
  "comments": 123, // approximate number of comments on the reddit post (0 if none)
  "url": "the url of the reddit discussion thread (or the search url if none found)"
}`;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: { 
            tools: [{ googleSearch: {} }] 
          }
        });
        
        let text = response.text?.trim() || "{}";
        if (text.startsWith('```json')) {
            text = text.substring(7);
            if (text.endsWith('```')) {
                text = text.substring(0, text.length - 3);
            }
        } else if (text.startsWith('```')) {
            text = text.substring(3);
            if (text.endsWith('```')) {
                text = text.substring(0, text.length - 3);
            }
        }
        
        try {
          const geminiResult = JSON.parse(text.trim());
          if (geminiResult.summary) {
              parsedResult = { ...parsedResult, ...geminiResult };
          }
        } catch(e) {
          console.error("Failed to parse Gemini response:", text);
        }
      } catch (err) {
        console.error("Gemini Search Error:", err);
      }

      const result = {
        summary: parsedResult.summary || "Vibe check unavailable",
        goods: parsedResult.goods || [],
        bads: parsedResult.bads || [],
        indicator: parsedResult.indicator || "mixed",
        upvotes: parsedResult.upvotes || 0,
        comments: parsedResult.comments || 0,
        url: parsedResult.url || `https://www.reddit.com/r/anime/search?q=${encodeURIComponent(title + " episode " + episodeNumber)}`
      };
      
      // We store the object in cache now
      aiSummaryCache[cacheKey] = result as any;
      await saveCache();
      
      res.json(result);
    } catch (err) {
      console.error("AI Vibe Generation Error:", err);
      res.json({ summary: "Vibe check unavailable due to AI limits.", goods: [], bads: [], indicator: "mixed", upvotes: 0, comments: 0, url: "" });
    }
  });

  // API Route for AniList Proxy
  app.post("/api/graphql", async (req, res) => {
    try {
      const anilistRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(req.body)
      });
      const data = await anilistRes.json();
      res.status(anilistRes.status).json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to proxy AniList" });
    }
  });

  // API Route for Recommendations
  app.post("/api/recommendations", async (req, res) => {
    try {
      const { libraryIds, topEntries, notInterestedIds } = req.body;
      if (!libraryIds || !topEntries) {
        return res.status(400).json({ error: "Missing library data" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ recommendations: [] });
      }

      // Step 1: Fetch recommendations from AniList for the top entries
      const query = `
        query($ids: [Int]) {
          Page(perPage: 15) {
            media(id_in: $ids) {
              id
              title { english userPreferred }
              recommendations(sort: RATING_DESC, perPage: 10) {
                nodes {
                  rating
                  mediaRecommendation {
                    id
                    idMal
                    title { english userPreferred }
                    coverImage { large color }
                    startDate { year month day }
                    nextAiringEpisode { airingAt timeUntilAiring episode }
                    status
                    episodes
                    averageScore
                    genres
                    description
                    externalLinks { url site icon color }
                  }
                }
              }
            }
          }
        }
      `;

      const sourceIds = topEntries.map((e: any) => e.showId);
      const anilistRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { ids: sourceIds } })
      });
      const anilistData = await anilistRes.json();
      
      const mediaList = anilistData?.data?.Page?.media || [];
      
      // Step 2: Scoring
      // candidate_score = sum over sources of (my_score_for_source / 10) * Math.log(1 + rec_vote_count)
      const candidates = new Map<number, { 
        score: number; 
        show: any; 
        basedOn: string[];
      }>();

      for (const media of mediaList) {
        const sourceEntry = topEntries.find((e: any) => e.showId === media.id);
        const sourceScore = sourceEntry?.showScore || 5; // default if somehow null
        const sourceTitle = media.title.english || media.title.userPreferred;

        const recEdges = media.recommendations?.nodes || [];
        for (const edge of recEdges) {
          const recMedia = edge.mediaRecommendation;
          const voteCount = edge.rating || 0;
          if (!recMedia || voteCount <= 0) continue;

          // Exclude anything already in library or not interested
          if (libraryIds.includes(recMedia.id) || (notInterestedIds || []).includes(recMedia.id)) continue;

          const candidateScore = (sourceScore / 10) * Math.log(1 + voteCount);
          
          if (!candidates.has(recMedia.id)) {
            candidates.set(recMedia.id, {
              score: 0,
              show: recMedia,
              basedOn: []
            });
          }
          const cand = candidates.get(recMedia.id)!;
          cand.score += candidateScore;
          if (!cand.basedOn.includes(sourceTitle)) {
            cand.basedOn.push(sourceTitle);
          }
        }
      }

      // Step 3: Take top 12
      const sortedCandidates = Array.from(candidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      // Step 4: Generate reasons with Gemini
      const ai = new GoogleGenAI({ apiKey });
      
      const finalRecs = await Promise.all(sortedCandidates.map(async (cand) => {
        const showId = cand.show.id;
        const cacheKey = `rec_reason_${showId}_${cand.basedOn.join('_')}`;
        let reason = "";

        if (aiSummaryCache[cacheKey]) {
          reason = aiSummaryCache[cacheKey];
        } else {
          try {
            const prompt = `You are an anime recommendation engine. A user is being recommended "${cand.show.title.english || cand.show.title.userPreferred}". They are recommended this because they highly rated these shows: ${cand.basedOn.join(', ')}.
Write EXACTLY ONE short sentence explaining why they would like this new show based on what those source shows have in common with it. Keep it spoiler-free, simple, and direct. Example: "Because you rated Frieren 9 — shares its quiet, melancholic adventure pacing."
Do not use quotes. Make it conversational.`;
            
            const response = await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt
            });
            reason = response.text?.trim() || `Based on your interest in ${cand.basedOn[0]}.`;
            aiSummaryCache[cacheKey] = reason;
          } catch (err) {
            reason = `Because you enjoyed ${cand.basedOn[0]}`;
          }
        }
        
        return {
          show: cand.show,
          score: cand.score,
          reason,
          basedOn: cand.basedOn
        };
      }));

      // Save cache after generating all reasons
      await saveCache();

      res.json({ recommendations: finalRecs });
    } catch (err) {
      console.error("Recommendations Error:", err);
      res.json({ recommendations: [] });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
