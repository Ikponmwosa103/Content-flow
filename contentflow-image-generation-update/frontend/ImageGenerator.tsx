import { useState } from "react";
import { ImagePlus, Sparkles, Download, RefreshCw, WandSparkles } from "lucide-react";
import "./image-generator.css";

type Props = {
  /** Existing authenticated API base URL, e.g. https://content-flow-7w1p.onrender.com */
  apiBaseUrl: string;
  /** Existing app's auth token getter. Keep the API key on the server, never here. */
  getAccessToken: () => Promise<string | null>;
  /** Optional current image allowance from the existing account/usage endpoint. */
  remainingImages?: number;
};

type GeneratedImage = { url?: string; dataUrl?: string; mimeType?: string; prompt?: string };

export default function ImageGenerator({ apiBaseUrl, getAccessToken, remainingImages = 0 }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Photorealistic");
  const [ratio, setRatio] = useState("1:1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<GeneratedImage | null>(null);

  async function generate() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) { setError("Describe the image you want to create first."); return; }
    if (remainingImages < 1) { setError("You have no image generations remaining. Upgrade your plan or wait for your allowance to reset."); return; }
    setBusy(true); setError(""); setImage(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/images/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: cleanPrompt, style, aspectRatio: ratio }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || payload?.message || `Image generation failed (${response.status}).`);
      if (!payload?.url && !payload?.dataUrl) throw new Error("The server returned no image. Please try again.");
      setImage({ ...payload, prompt: cleanPrompt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate image. Please try again.");
    } finally { setBusy(false); }
  }

  const src = image?.dataUrl || image?.url;
  return <main className="cf-image-page">
    <header className="cf-image-heading">
      <div className="cf-image-icon"><WandSparkles size={23} /></div>
      <div><p className="cf-image-eyebrow">CONTENT STUDIO</p><h1>AI Image Generator</h1><p className="cf-image-subtitle">Turn a simple description into a visual for your next post.</p></div>
      <div className="cf-image-credit"><ImagePlus size={16} /><strong>{remainingImages}</strong><span>images left</span></div>
    </header>

    <div className="cf-image-layout">
      <section className="cf-image-panel cf-image-controls">
        <label htmlFor="cf-image-prompt">Describe your image</label>
        <textarea id="cf-image-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000}
          placeholder="A vibrant product photo of a skincare bottle on a cream stone pedestal, soft sunlight, premium editorial styling..." />
        <div className="cf-image-char-count">{prompt.length}/2000</div>
        <div className="cf-image-field-row">
          <div><label htmlFor="cf-image-style">Visual style</label><select id="cf-image-style" value={style} onChange={e => setStyle(e.target.value)}>
            {['Photorealistic','Editorial','3D render','Illustration','Minimalist','Cinematic','Watercolor','Social media graphic'].map(x => <option key={x}>{x}</option>)}
          </select></div>
          <div><label htmlFor="cf-image-ratio">Aspect ratio</label><select id="cf-image-ratio" value={ratio} onChange={e => setRatio(e.target.value)}>
            <option value="1:1">Square · 1:1</option><option value="4:5">Portrait · 4:5</option><option value="9:16">Story · 9:16</option><option value="16:9">Landscape · 16:9</option>
          </select></div>
        </div>
        <button className="cf-image-generate" onClick={generate} disabled={busy || remainingImages < 1}>
          {busy ? <><RefreshCw size={17} className="cf-spin" /> Creating your image…</> : <><Sparkles size={17} /> Generate image <span>· 1 credit</span></>}
        </button>
        {error && <p className="cf-image-error" role="alert">{error}</p>}
        <p className="cf-image-note">Only successful generations should use a credit. Credits must be checked and deducted securely by the backend.</p>
      </section>

      <section className="cf-image-panel cf-image-preview-panel">
        <div className="cf-image-preview-top"><h2>Your creation</h2><span>PREVIEW</span></div>
        {src ? <div className="cf-image-result"><img src={src} alt={image?.prompt || "AI-generated result"} />
          <a className="cf-image-download" href={src} download="contentflow-generated-image.png"><Download size={16} /> Download image</a></div>
          : <div className={`cf-image-empty ${busy ? 'is-busy' : ''}`}>
            <div className="cf-image-empty-art"><div className="cf-art-sun"/><div className="cf-art-mountain one"/><div className="cf-art-mountain two"/><div className="cf-art-orb"/></div>
            <h3>{busy ? "Bringing your idea to life" : "Your next great visual starts here"}</h3>
            <p>{busy ? "This can take a little while. Keep this page open." : "Write a prompt, choose a style, and generate your first image."}</p>
          </div>}
      </section>
    </div>
  </main>;
}
