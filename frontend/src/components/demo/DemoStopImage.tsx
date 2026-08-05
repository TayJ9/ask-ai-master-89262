export default function DemoStopImage({
  png,
  alt,
  width,
  height,
  loading,
  fetchPriority,
  decoding,
}: {
  png: string;
  alt: string;
  width: number;
  height: number;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  decoding?: "sync" | "async" | "auto";
}) {
  const webp = png.replace(/\.png$/, ".webp");
  return (
    <picture className="absolute inset-0 block h-full w-full">
      <source srcSet={webp} type="image/webp" />
      <img
        src={png}
        alt={alt}
        width={width}
        height={height}
        className="h-full w-full object-cover object-top"
        loading={loading}
        fetchpriority={fetchPriority}
        decoding={decoding}
      />
    </picture>
  );
}
