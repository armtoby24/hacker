class Map3DVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight || 1, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); 
        
        // Setup renderer size
        this.resize();
        this.container.appendChild(this.renderer.domElement);

        this.camera.position.z = 8;
        this.camera.position.y = 2;
        this.camera.position.x = 2;
        this.camera.lookAt(3, 0, -4);

        this.nodes = {}; 
        this.edges = []; 

        // Matching CSS colors
        this.nodeMaterialStandard = new THREE.MeshBasicMaterial({ color: 0x008f11, wireframe: true });
        this.nodeMaterialDiscovered = new THREE.MeshBasicMaterial({ color: 0x00ff41, wireframe: true });
        this.nodeMaterialCurrent = new THREE.MeshBasicMaterial({ color: 0xb8ffb8, wireframe: true, wireframeLinewidth: 2 });
        this.iceMaterial = new THREE.MeshBasicMaterial({ color: 0xff003c, wireframe: true, transparent: true, opacity: 0.8 });
        
        this.edgeMaterialStandard = new THREE.LineBasicMaterial({ color: 0x003b00, transparent: true, opacity: 0.3 });
        this.edgeMaterialDiscovered = new THREE.LineBasicMaterial({ color: 0x008f11, transparent: true, opacity: 0.8 });
        
        this.buildNetwork();

        window.addEventListener('resize', () => { this.resize(); });
        
        // Also watch for container resize as flexbox might change it
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => { this.resize(); });
            resizeObserver.observe(this.container);
        }

        this.animate = this.animate.bind(this);
        this.animate();
    }

    resize() {
        if(this.container.clientWidth === 0 || this.container.clientHeight === 0) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    createTextSprite(message) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;
                
        context.font = "bold 34px 'Fira Code', monospace";
        context.fillStyle = "#00ff41"; 
        context.textAlign = "center";
        context.textBaseline = "middle";
        
        context.shadowColor = "rgba(0, 255, 65, 0.8)";
        context.shadowBlur = 8;

        context.fillText(message, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Scale appropriately for 512x128 aspect ratio (4:1)
        sprite.scale.set(3.2, 0.8, 1); 
        return sprite;
    }

    buildNetwork() {
        const nodeGeometry = new THREE.OctahedronGeometry(0.5, 0); 
        const iceGeometry = new THREE.OctahedronGeometry(0.7, 0); // Outer layer for ICE
        
        for (const [id, nodeData] of Object.entries(NetworkGraph)) {
            const mesh = new THREE.Mesh(nodeGeometry, this.nodeMaterialStandard);
            
            const iceMesh = new THREE.Mesh(iceGeometry, this.iceMaterial.clone());
            iceMesh.visible = false;
            mesh.userData.iceMesh = iceMesh;
            mesh.add(iceMesh);
            
            const labelSprite = this.createTextSprite(id);
            if (nodeData.pos) {
                labelSprite.position.set(nodeData.pos.x, nodeData.pos.y - 1.3, nodeData.pos.z);
            }
            labelSprite.visible = false;
            mesh.userData.labelSprite = labelSprite;
            this.scene.add(labelSprite);
            
            if (nodeData.pos) {
                mesh.position.set(nodeData.pos.x, nodeData.pos.y, nodeData.pos.z);
            }
            this.scene.add(mesh);
            this.nodes[id] = mesh;
            
            // Add orbiting downloadables
            mesh.userData.keyMeshes = [];
            if (nodeData.keys && nodeData.keys.length > 0) {
                const keyGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
                const keyMaterial = new THREE.MeshBasicMaterial({ color: 0xffb800, wireframe: true }); // Gold
                
                nodeData.keys.forEach((keyName, index) => {
                    const keyMesh = new THREE.Mesh(keyGeometry, keyMaterial);
                    const angle = (index / nodeData.keys.length) * Math.PI * 2;
                    const radius = 0.9;
                    keyMesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
                    keyMesh.userData = { name: keyName };
                    
                    mesh.userData.keyMeshes.push(keyMesh);
                    mesh.add(keyMesh);
                });
            }
            
            // Render thin lines for all connections
            for (const linkId of nodeData.links) {
                const linkNode = NetworkGraph[linkId];
                if (!linkNode || !linkNode.pos) continue;
                
                const points = [];
                points.push(new THREE.Vector3(nodeData.pos.x, nodeData.pos.y, nodeData.pos.z));
                points.push(new THREE.Vector3(linkNode.pos.x, linkNode.pos.y, linkNode.pos.z));
                
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(lineGeometry, this.edgeMaterialStandard);
                line.userData = { source: id, target: linkId };
                this.scene.add(line);
                this.edges.push(line);
            }
        }
    }

    update(gameState) {
        for (const [id, mesh] of Object.entries(this.nodes)) {
            const nodeData = NetworkGraph[id];
            
            // Only visible if discovered
            mesh.visible = gameState.discoveredNodes.has(id);
            
            if (mesh.userData.iceMesh) {
                mesh.userData.iceMesh.visible = mesh.visible && nodeData.ice > 0;
                
                if (mesh.userData.iceMesh.visible) {
                    const iceLevel = nodeData.ice;
                    
                    // Size scales with ICE level
                    const scale = 0.8 + (iceLevel * 0.15);
                    mesh.userData.iceMesh.scale.set(scale, scale, scale);
                    
                    // Brightness via opacity
                    mesh.userData.iceMesh.material.opacity = Math.min(0.2 + (iceLevel * 0.1), 1.0);
                    
                    // Color shifts from orange to intense red based on ICE level
                    const r = 255;
                    const g = Math.max(0, 150 - (iceLevel * 20));
                    const b = 60;
                    mesh.userData.iceMesh.material.color.setRGB(r/255, g/255, b/255);
                }
            }
            
            if (mesh.userData.keyMeshes) {
                mesh.userData.keyMeshes.forEach(keyMesh => {
                    const hasKey = nodeData.keys.includes(keyMesh.userData.name);
                    keyMesh.visible = mesh.visible && hasKey;
                });
            }
            
            if (mesh.userData.labelSprite) {
                mesh.userData.labelSprite.visible = mesh.visible;
            }

            if (!mesh.visible) continue;

            if (id === gameState.location) {
                mesh.material = this.nodeMaterialCurrent;
                mesh.scale.set(1.5, 1.5, 1.5);
            } else {
                mesh.material = this.nodeMaterialDiscovered;
                mesh.scale.set(1, 1, 1);
            }
        }

        for (const line of this.edges) {
            const { source, target } = line.userData;
            line.visible = gameState.discoveredNodes.has(source) && gameState.discoveredNodes.has(target);
            if (line.visible) {
                line.material = this.edgeMaterialDiscovered;
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        const time = Date.now() * 0.002;
        
        for (const [id, mesh] of Object.entries(this.nodes)) {
            mesh.rotation.y += 0.01;
            mesh.rotation.x += 0.005;

            if (mesh.userData.iceMesh && mesh.userData.iceMesh.visible) {
                // Rotate the ICE layer slightly differently for a dynamic look
                mesh.userData.iceMesh.rotation.y -= 0.015;
                mesh.userData.iceMesh.rotation.z += 0.01;
            }
            
            if (mesh.userData.keyMeshes) {
                mesh.userData.keyMeshes.forEach(keyMesh => {
                    keyMesh.rotation.x -= 0.02;
                    keyMesh.rotation.y += 0.03;
                });
            }
            
            if (mesh.material === this.nodeMaterialCurrent) {
                const s = 1.3 + Math.sin(time * 3) * 0.2;
                mesh.scale.set(s, s, s);
            }
        }
        
        // Gentle scene rotation
        this.scene.rotation.y = Math.sin(time * 0.1) * 0.2;
        this.scene.rotation.x = Math.cos(time * 0.1) * 0.05;

        this.renderer.render(this.scene, this.camera);
    }
}
