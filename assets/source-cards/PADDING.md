# Card display bounds

All sixteen source PNGs are 3050×4038. Their nontransparent bounding boxes are identical: left 197, top 160, right 2854, bottom 3878 (exclusive).

The build extracts a common 2660×3724 rectangle at (195,157), an exact 5:7 ratio surrounding every visible source pixel, then proportionally scales to 420×588 WebP. Original PNGs remain unchanged. The crop removes transparent outer padding, retaining artwork and borders. All card zones use the same 5:7 display box.
