import sys
import subprocess
import os

try:
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def remove_white_bg(img_path):
    img = Image.open(img_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    
    # We will use a stack for DFS which is faster than BFS queue for floodfill
    stack = []
    visited = set()
    
    # Check 4 corners for white-ish color
    corners = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
    for cx, cy in corners:
        color = pixels[cx, cy]
        if color[0] > 230 and color[1] > 230 and color[2] > 230:
            stack.append((cx, cy))
            visited.add((cx, cy))

    while stack:
        x, y = stack.pop()
        pixels[x, y] = (255, 255, 255, 0) # transparent
        
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                if (nx, ny) not in visited:
                    color = pixels[nx, ny]
                    if color[0] > 230 and color[1] > 230 and color[2] > 230:
                        visited.add((nx, ny))
                        stack.append((nx, ny))
                        
    img.save(img_path, "PNG")
    print(f"Processed {img_path}")

def main():
    dir_path = "public/Delivery"
    for filename in os.listdir(dir_path):
        if filename.endswith(".png") and filename.startswith("icon-"):
            img_path = os.path.join(dir_path, filename)
            remove_white_bg(img_path)

if __name__ == "__main__":
    main()
