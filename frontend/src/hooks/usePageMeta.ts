import { useEffect } from "react";

type PageMeta = {
  title: string;
  description: string;
  imagePath?: string;
};

const DEFAULT_TITLE = "AI Interview Coach";
const DEFAULT_DESCRIPTION =
  "AI voice interview practice for students and early-career candidates. Realistic sessions, detailed feedback, and a clear path to improve.";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function usePageMeta({ title, description, imagePath }: PageMeta) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");

    if (imagePath) {
      const imageUrl = new URL(imagePath, window.location.origin).href;
      upsertMeta("property", "og:image", imageUrl);
      upsertMeta("name", "twitter:card", "summary_large_image");
      upsertMeta("name", "twitter:image", imageUrl);
    }

    return () => {
      document.title = prevTitle;
      upsertMeta("name", "description", DEFAULT_DESCRIPTION);
      upsertMeta("property", "og:title", DEFAULT_TITLE);
      upsertMeta("property", "og:description", DEFAULT_DESCRIPTION);
    };
  }, [title, description, imagePath]);
}
