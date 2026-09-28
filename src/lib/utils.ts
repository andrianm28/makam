import { createCn } from "cn/config"

/**
 * Class merging that knows the design system's type scale (globals.css):
 * without this, `text-small` would be taken for a text colour and dropped
 * next to `text-muted-foreground`. Always import cn from here.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-1",
            "title-2",
            "title-3",
            "body-lg",
            "body",
            "small",
            "caption",
            "hero",
            "hero-lg",
            "page-title",
            "section-title",
          ],
        },
      ],
    },
  },
})
