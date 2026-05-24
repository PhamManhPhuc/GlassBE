import productService from '../services/productService.js';
import dotenv from 'dotenv';
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GOOGLE_API_KEY}`;

const aiController = {
  async recommend(req, res) {
    try {
      const { needsDescription } = req.body;
      if (!needsDescription || typeof needsDescription !== 'string') {
        return res.status(400).json({ errCode: 1, message: 'needsDescription is required' });
      }

      // Fetch a sample of products from the DB
      const result = await productService.getAllProducts({ page: 1, limit: 20 });
      const catalog = (result.products ?? result ?? []).slice(0, 15);

      const catalogText = catalog.map((p) =>
        `${p.id}|${p.name}|${p.Shape?.name ?? ''}|${p.Brand?.name ?? ''}`
      ).join('\n');

      const prompt = `Bạn là chuyên gia tư vấn kính cho cửa hàng KYRO.

Danh sách sản phẩm (chỉ chọn từ danh sách này, định dạng: ID|Tên|Dáng|Hãng):
${catalogText}

Yêu cầu khách hàng: "${needsDescription}"

Trả về JSON hợp lệ, không có markdown, không có chú thích:
{"reasoning":"lý do ngắn gọn bằng tiếng Việt","productIds":[id1,id2,id3]}`;

      const geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      });

      if (!geminiRes.ok) {
        throw new Error(`Gemini API error: ${geminiRes.status}`);
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const productIds = Array.isArray(parsed.productIds)
        ? parsed.productIds.map(Number)
        : [];
      const recommendations = catalog.filter((p) => productIds.includes(Number(p.id)));

      return res.json({
        errCode: 0,
        data: {
          reasoning: parsed.reasoning ?? '',
          recommendations,
        },
      });
    } catch (error) {
      console.error('AI recommend error:', error);
      return res.status(500).json({ errCode: -1, message: 'AI recommendation failed' });
    }
  },
};

export default aiController;
