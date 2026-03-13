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

    buildNetwork() {
        const nodeGeometry = new THREE.OctahedronGeometry(0.5, 0); 
        const iceGeometry = new THREE.OctahedronGeometry(0.7, 0); // Outer layer for ICE
        
        for (const [id, nodeData] of Object.entries(NetworkGraph)) {
            const mesh = new THREE.Mesh(nodeGeometry, this.nodeMaterialStandard);
            
            const iceMesh = new THREE.Mesh(iceGeometry, this.iceMaterial);
            iceMesh.visible = false;
            mesh.userData.iceMesh = iceMesh;
            mesh.add(iceMesh);
            if (nodeData.pos) {
                mesh.position.set(nodeData.pos.x, nodeData.pos.y, nodeData.pos.z);
            }
            this.scene.add(mesh);
            this.nodes[id] = mesh;
            
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
