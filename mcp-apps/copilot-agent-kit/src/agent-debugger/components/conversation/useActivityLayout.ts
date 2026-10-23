import { useEffect, useState } from 'react';

/**
 * The Conversation & activities layout for a view width:
 * - `tri`: conversation, activity list and detail card in three columns (1080 px or more, MEDIA.minTri).
 * - `duo`: conversation and activity list in two columns; details open in place (640-1079 px).
 * - `single`: one pane at a time with a switch (639 px or less, MEDIA.maxSm).
 */
export type ActivityLayout = 'tri' | 'duo' | 'single';

export function activityLayoutForWidth(width: number): ActivityLayout {
  if (width >= 1080) return 'tri';
  if (width <= 639) return 'single';
  return 'duo';
}

/** Follows the view (iframe) width, the same width that the design media queries use. */
export function useActivityLayout(): ActivityLayout {
  const [layout, setLayout] = useState<ActivityLayout>(() =>
    typeof window === 'undefined' ? 'tri' : activityLayoutForWidth(window.innerWidth));
  useEffect(() => {
    const update = () => setLayout(activityLayoutForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}
