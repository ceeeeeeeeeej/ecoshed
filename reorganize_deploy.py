import os
import shutil
import re

# Paths
base_dir = r"c:\4th Year 1st Semester\echoshedv2-20260406T142010Z-3-001\echoshedv2\Admin_Dashboard\Admin_Dashboard\Admin_Dashboard"
deploy_dir = os.path.join(base_dir, "deploy")

# New subdirectories
dirs = ['css', 'js', 'assets', 'sql']
for d in dirs:
    os.makedirs(os.path.join(deploy_dir, d), exist_ok=True)

print(f"Organizing files in: {deploy_dir}")

# File movements
files_moved = 0
for filename in os.listdir(deploy_dir):
    src = os.path.join(deploy_dir, filename)
    if os.path.isdir(src) or filename in ['index.html', 'README.md', 'FIREBASE_SETUP.md']:
        continue
        
    dest_dir = None
    if filename.endswith('.css'):
        dest_dir = 'css'
    elif filename.endswith('.js'):
        dest_dir = 'js'
    elif filename.endswith('.png') or filename.endswith('.jpg'):
        dest_dir = 'assets'
    elif filename.endswith('.sql'):
        dest_dir = 'sql'
    
    if dest_dir:
        shutil.move(src, os.path.join(deploy_dir, dest_dir, filename))
        files_moved += 1

# Update HTML references
print("Updating HTML links...")
html_files = [f for f in os.listdir(deploy_dir) if f.endswith('.html')]
for html_file in html_files:
    path = os.path.join(deploy_dir, html_file)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix paths: ../css/ -> css/, ../js/ -> js/, etc.
    content = content.replace('../css/', 'css/')
    content = content.replace('../js/', 'js/')
    content = content.replace('../assets/', 'assets/')
    content = content.replace('../assets/image/logo/', 'assets/')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"✅ Success! Moved {files_moved} files and updated {len(html_files)} HTML files.")
print("🚀 Now you can run your git commands.")
