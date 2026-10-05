/** Burn the watermark into a reduced preview; never upload the original here. */
export async function watermarkedPreview(file: File, text: string): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 50 * 1024 ** 2) throw new Error("invalid_image");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(16, Math.round(canvas.width / 24));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    for (let y = fontSize; y < canvas.height; y += fontSize * 5) {
      for (let x = canvas.width / 4; x < canvas.width; x += canvas.width / 2) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 8);
        ctx.strokeText(text, 0, 0, canvas.width * 0.45);
        ctx.fillText(text, 0, 0, canvas.width * 0.45); ctx.restore();
      }
    }
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-preview.webp`, { type: "image/webp" });
  } finally { image.close(); }
}
