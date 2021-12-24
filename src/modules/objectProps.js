'use strict';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { createCircleFromPoints, ringUVMapGeometry } from './utils';
import { orrery } from './orrery';
import { scene } from './scene';
import { settings } from './settings';
import { checkIfDesktop, easeTo, fadeTargetLineOpacity, calculateOrbit, convertToCamelCase } from './utils';
import { textureLoader } from './loadManager'; // still not 100% sure if this creates a new instantiation of it, we don't want that
import { CSS2DObject } from './custom/jsm/renderers/CSS2DRenderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/gltfloader';
import { asteroidBelt } from './factories/solarSystemFactory';
import { handleLabelClick } from './events/mousePointer';
import fragmentShader from './shaders/glow/fragmentShader.glsl';
import vertexShader from './shaders/glow/vertexShader.glsl';
import sunFragmentShader from './shaders/sun/fragmentShader.glsl';
import sunVertexShader from './shaders/sun/vertexShader.glsl';
import simpleFragmentShader from './shaders/debug/simpleFragmentShader.glsl';
import simpleVertexShader from './shaders/debug/simpleVertexShader.glsl';
import { materialData as rawMaterialData } from './data/solarSystem';

const planetRangeThreshold = 50000000; // Jupiter moons appear from Ceres at higher range...
// TODO: set it at this range only for the planet/moon that's targeted
// const planetRangeThreshold = 500000000; // Jupiter moons appear from Ceres at higher range...
const innerMoonRangeThreshold = 1700000;
const majorMoonRangeThreshold = 25000000;
const planetOrbitLineRangeThreshold = 2000000;

const setOrbitVisibility = () => {
	return (orrery.orbitLines._orbitLinesVisible = settings.orbitLines._orbitVisibilityCheckbox.checked);
};

class OrbitLine {
	constructor(data, classRef) {
		this.data = data;
		this.classRef = classRef;
		this.orbitLineName = `${this.data.englishName} orbit line`;
		this.orbitLine = null;
		this.fadingIn = false;
		this.fadingOut = false;
		this.orbitLineVisibleAtBuild = this.classRef.orbitLineVisibleAtBuild;
		this.opacityDefault = this.data.isDwarfPlanet || this.data.isOuterMoon ? 0.2 : 1;
		this.parentPlanetData = this.data.aroundPlanet
			? orrery.bodies._allPlanets.find((p) => p.id === this.data.aroundPlanet.planet)
			: null;
		this.parentPlanetId = this.parentPlanetData ? convertToCamelCase(this.parentPlanetData.englishName) : null;
		this.parentPlanetType = this.parentPlanetData
			? this.parentPlanetData.isDwarfPlanet
				? '_dwarfPlanets'
				: '_planets'
			: null;
	}

	build() {
		const isMoon = this.data.aroundPlanet;
		const points = [];

		for (let i = this.data.meanAnomaly; i <= this.data.meanAnomaly + 360; i += 1) {
			const v = new THREE.Vector3();
			points.push(v.copy(calculateOrbit(i, this.data, this.parentPlanetData)));
		}

		const orbitPoints = points;

		// create geometry using all points on the circle
		const geometryLine = new THREE.BufferGeometry().setFromPoints(orbitPoints);

		const startColor = new THREE.Color(this.data.labelColour);
		const endColor = new THREE.Color('black');

		const vertCnt = geometryLine.getAttribute('position').count;
		const lerpAcc = 1; // how much fade we want, closer to 0 means fades earlier
		const lerpIncrementer = 1 / 360 / lerpAcc;

		const colors = new Float32Array(vertCnt * 3);
		for (let i = 0; i <= 360; i += 1) {
			const lerpColor = new THREE.Color(startColor);
			lerpColor.lerpColors(startColor, endColor, i * lerpIncrementer);

			colors[i * 3 + 0] = lerpColor.r;
			colors[i * 3 + 1] = lerpColor.g;
			colors[i * 3 + 2] = lerpColor.b;
		}

		geometryLine.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		this.orbitLine = new THREE.Line(
			geometryLine,
			new THREE.LineBasicMaterial({
				color: isMoon ? settings.planetColours.default : '#FFF',
				transparent: true,
				opacity: 0,
				visible: this.classRef.orbitLineVisibleAtBuild,
				blending: THREE.AdditiveBlending,
				vertexColors: true
			})
		);

		this.orbitLine.name = this.orbitLineName;

		// to prevent planet orbit lines from 'cutting through' the moon orbit lines due to the transparency fade conflicting with the render order
		if (this.parentPlanetData) {
			this.orbitLine.renderOrder = 2;
		} else {
			this.orbitLine.renderOrder = this.orbitLine.isDwarfPlanet ? 3 : 4;
		}

		this.classRef.labelGroup.parent.add(this.orbitLine);

		// initial page load
		if (this.orbitLine.material.opacity === 0 && this.classRef.orbitLineVisibleAtBuild) {
			this.fadeIn();
		}
	}

	fadeOut() {
		if (!this.fadingOut && this.orbitLine.material.opacity !== 0) {
			this.fadingOut = true;
			gsap.to(this.orbitLine.material, {
				opacity: 0,
				duration: 0.25,
				onComplete: () => {
					// TODO: debug mode complete message?
					this.fadingOut = false;
					this.orbitLine.material.visible = false;
				}
			});
		}
	}

	fadeIn() {
		if (!this.fadingIn && this.orbitLine.material.opacity !== this.opacityDefault) {
			this.fadingIn = true;
			this.orbitLine.material.visible = true;
			gsap.to(this.orbitLine.material, {
				opacity: this.opacityDefault,
				duration: 0.5,
				onComplete: () => {
					this.fadingIn = false;
				}
			});
		}
	}

	remove() {
		if (!this.fadingOut) {
			this.fadingOut = true;
			gsap.to(this.orbitLine.material, {
				opacity: 0,
				duration: 0.25,
				onComplete: () => {
					this.fadingOut = false;
					orrery.classes[this.parentPlanetType][this.parentPlanetId].labelGroup.children
						.find((o) => o.name === this.orbitLineName)
						.removeFromParent();
				}
			});
		}
	}
}

class MoonLabelClass {
	constructor(data, planetGroup) {
		this.data = data;
		this.labelDiv = document.createElement('div');
		this.labelGroup = new THREE.Group();
		this.meshGroup = null;
		this.intervalCheckDistance = null;
		this.planetGroup = planetGroup;
		this.fadingIn = false;
		this.fadingOut = false;
		this.isAdded = false;
		this.isInRange = false;
		this.distanceFromCamera = null;
		this.distanceFromPlanet = null;
		this.CSSObj = new CSS2DObject(this.labelDiv, this);
		this.raycaster = new THREE.Raycaster();
		this.raycasterArrow = new THREE.ArrowHelper(0, 0, 200000000, this.data.labelColour);

		this.orbitLineVisibleAtBuild = this.planetGroup.data.moons.length < 20 || this.data.perihelion < 10000000; // orbit line limits set here
		this.OrbitLine = new OrbitLine(data, this);

		// debug stuff
		this.raycasterArrowEnabled = false;
	}

	build() {
		if (this.isAdded) return;
		this.isAdded = true;

		this.labelDiv.className = `label is-moon ${this.data.isMajorMoon ? 'is-major-moon' : ''} ${
			this.data.isInnerMoon ? 'is-inner-moon' : ''
		}`;
		this.labelDiv.dataset.selector = 'label';
		this.labelDiv.style.color = this.data.labelColour;
		this.labelDiv.style.opacity = 0;
		this.labelDiv.innerHTML = `
			<div class="label-content">
				<div class="label-circle"></div>
				<div class="label-text">${this.data.englishName}</div>
			</div>
			`;
		this.CSSObj.name = this.data.key;
		this.CSSObj.position.set(0, 0, 0);

		this.labelGroup.name = `${this.data.englishName} group label`;
		this.labelGroup.data = this.data;
		this.labelGroup.add(this.CSSObj);

		// calculate orbit
		this.labelGroup.position.copy(this.data.startingPosition);

		this.labelDiv.addEventListener('pointerdown', () => {
			handleLabelClick(this);
		});

		this.labelDiv.addEventListener('mouseover', () => {
			orrery.mouseState._hoveredClass = this;
		});

		this.labelDiv.addEventListener('mouseleave', () => {
			orrery.mouseState._hoveredClass = '';
		});

		setTimeout(() => {
		this.intervalCheckDistance = setInterval(() => {
			this.handleDistance();
				if (this.CSSObj.inFrustum) {
					this.updateRaycaster();
				}
		}, 200);
		if (this.raycasterArrowEnabled) scene.add(this.raycasterArrow);
		}, 800);

		this.planetGroup.add(this.labelGroup);

		// building orbitLine after the group is added to the scene, so the group has a parent
		// limiting the number of orbitLines RENDERED to save memory
		this.OrbitLine.build();

		gsap.to(this.labelDiv, {
			opacity: 1,
			duration: 1,
			onComplete: () => {
				// TODO: meshes should start invisible, or build when the camera is close enough
				this.buildMoonMesh();
			}
		});
	}

	buildMoonMesh() {
		// will return a promise
		const constructMoonMesh = async () => {
			if (this.meshGroup) return this.meshGroup;

			const materialData = this.data.materialData || rawMaterialData.moon;
			const segments = materialData.segments || 32;

			const material = {
				map: materialData.map ? await textureLoader.loadAsync(materialData.map) : null,
				normalMap: materialData.normalMap ? await textureLoader.loadAsync(materialData.normalMap) : null,
				transparent: false
				// emissiveMap: materialData.emissiveMap ? await textureLoader.loadAsync(materialData.emissiveMap) : null,
				// emissive: materialData.emissive || null,
				// emissiveIntensity: materialData.emissiveIntensity || null
			};

			const moonGroup = new THREE.Group();
			moonGroup.class = this;
			moonGroup.name = this.data.key;

			const geometry = new THREE.SphereBufferGeometry(this.data.diameter, segments, segments);
			const moonMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(material));
			moonMesh.name = this.data.key;
			moonMesh.receiveShadow = true;
			moonGroup.add(moonMesh);

			return moonGroup;
		};

		constructMoonMesh().then((meshGroup) => {
			this.meshGroup = meshGroup;
			this.labelGroup.add(meshGroup);
		});
	}

	handleDistance() {
		const v3 = new THREE.Vector3();
		const moonWorldPosition = this.labelGroup.getWorldPosition(v3);
		this.distanceFromCamera = orrery.camera.position.distanceTo(moonWorldPosition);
		const cameraZoomedToMoon = this.distanceFromCamera < this.data.zoomTo + 10000;

		if (cameraZoomedToMoon) {
			this.labelDiv.classList.add('faded');
		} else {
			this.labelDiv.classList.remove('faded');
		}

		if (this.OrbitLine) {
			if (cameraZoomedToMoon) {
				this.OrbitLine.fadeOut();
			} else {
				if (
					(this.orbitLineVisibleAtBuild && this.distanceFromPlanet < planetRangeThreshold) ||
					(orrery.mouseState._clickedClass && orrery.mouseState._clickedClass.data.key === this.data.key) ||
					(orrery.mouseState._hoveredClass && orrery.mouseState._hoveredClass.data.key === this.data.key)
				) {
					this.OrbitLine.fadeIn();
				} else {
					this.OrbitLine.fadeOut();
				}
			}
		}
	}

	updateRaycaster() {
		// setting raycaster line that'll go from the moonGroup to the camera
		const cameraPos = orrery.camera.position;
		const thisPos = new THREE.Vector3();
		this.labelGroup.getWorldPosition(thisPos);
		const vDirection = new THREE.Vector3();
		const direction = vDirection.subVectors(thisPos, cameraPos).normalize();
		this.raycaster.set(cameraPos, direction);
		this.raycasterArrow.position.copy(cameraPos);
		this.raycasterArrow.setDirection(direction);

		// TODO: could be more efficient?
		const intersects = this.raycaster.intersectObjects(scene.children, true);
		const meshIntersects = intersects.filter((i) => i.object && i.object.type === 'Mesh' && i.object.name !== 'skybox');

		if (meshIntersects.length && meshIntersects[0].object.name !== this.data.key) {
			this.labelDiv.classList.add('behind-planet');
		} else {
			this.labelDiv.classList.remove('behind-planet');
		}
	}

	remove() {
		if (!this.fadingOut && this.isAdded) {
			// fading out OrbitLine BEFORE planet (once the planet is gone, so is the line)
			this.fadingOut = true;

			gsap.to(this.labelDiv.querySelector('.label-content'), {
				opacity: 0,
				duration: 1,
				onComplete: () => {
					if (this.OrbitLine) this.OrbitLine.remove();
					// setTimeout seems to allow smoother fading? Weird...
					setTimeout(() => {
						clearInterval(this.intervalCheckDistance);

						// snap the camera back to the planet if the clicked group moon is deloaded
						if (
							orrery.mouseState._clickedGroup &&
							orrery.mouseState._clickedGroup.data &&
							orrery.mouseState._clickedGroup.data.aroundPlanet
						) {
							orrery.mouseState._clickedGroup = orrery.mouseState._clickedGroup.parent;
						}
						this.labelGroup.children.forEach((child) => child.removeFromParent());
						this.labelGroup.removeFromParent();
						this.isAdded = false;
						this.fadingOut = false;
						if (this.raycasterArrowEnabled) this.raycasterArrow.removeFromParent();
					}, 100);
				}
			});
		}
	}
}

class PlanetLabelClass {
	constructor(data) {
		this.data = data;
		this.labelDiv = document.createElement('div');
		this.labelGroup = new THREE.Group();
		this.meshGroup = null;
		this.intervalCheckDistance = null;
		this.fadingIn = false;
		this.fadingOut = false;
		this.isVisible = false;
		this.planetTypeKey = this.data.isDwarfPlanet ? '_dwarfPlanets' : '_planets';
		this.CSSObj = new CSS2DObject(this.labelDiv, this);
		this.raycaster = new THREE.Raycaster();
		this.raycasterArrow = new THREE.ArrowHelper(0, 0, 200000000, this.data.labelColour);

		// TODO: move this into its own Sun class
		this.uniforms = {
			aspectRatio: { type: 'f', value: window.innerWidth / window.innerHeight },
			sunPos: { type: 'v3', value: new THREE.Vector3() },
			sunScreenPos: { type: 'v3', value: new THREE.Vector3(0, 0, 0) },
			sunSize: { type: 'f', value: 0.1 },
			randAngle: { type: 'f', value: 0.1 },
			camAngle: { type: 'f', value: 0.26 }
		};

		this.moonClasses = {};

		this.orbitLineVisibleAtBuild = true;
		this.OrbitLine = new OrbitLine(data, this);

		this.raycasterArrowEnabled = false;
	}

	build() {
		this.labelDiv.className = `label behind-label ${
			this.data.isPlanet || this.data.englishName === 'Sun' ? 'is-planet' : 'is-dwarf-planet'
		} ${this.data.isSun ? 'is-sun' : ''}`;
		this.labelDiv.dataset.selector = 'label';
		this.labelDiv.style.color = this.data.labelColour;
		this.labelDiv.style.opacity = 0;
		this.labelDiv.innerHTML = `
			<div class="label-content">
				<div class="label-circle"></div>
				<div class="label-text" style="color: ${
					this.data.labelColour !== settings.planetColours.default ? this.data.labelColour : ''
				};">${this.data.englishName}</div>
			</div>
			`;
		this.CSSObj.name = this.data.key;
		this.CSSObj.position.set(0, 0, 0);

		this.labelGroup.name = `${this.data.englishName} group label`;
		this.labelGroup.data = this.data;
		this.labelGroup.add(this.CSSObj);
		orrery.bodies._planetLabels[this.data.key] = this.labelGroup;

		// calculate orbit
		if (this.data.startingPosition) {
			this.labelGroup.position.copy(this.data.startingPosition);
		} else {
			this.labelGroup.position.set(0, 0, 0);
		}

		this.labelDiv.addEventListener('pointerdown', () => {
			handleLabelClick(this);
		});

		this.labelDiv.addEventListener('mouseover', () => {
			orrery.mouseState._hoveredClass = this;
		});

		this.labelDiv.addEventListener('mouseleave', () => {
			orrery.mouseState._hoveredClass = '';
		});

		setTimeout(() => {
			this.intervalCheckDistance = setInterval(() => {
				this.handleDistance();
				if (this.CSSObj.inFrustum) {
					this.updateRaycaster();
				}
			}, 200);
			if (this.raycasterArrowEnabled) scene.add(this.raycasterArrow);
		}, 500);

		scene.add(this.labelGroup);

		if (this.data.moons && this.data.moons.length) {
			this.data.moons.forEach((moon) => {
				// now rather than pushing to an array, using key/value pairs for easier referencing
				// is scoped to the planet so can more easily run them through like an array if need be
				this.moonClasses[moon.key] = new MoonLabelClass(moon, this.labelGroup);
				orrery.classes._moons[moon.key] = this.moonClasses[moon.key];
			});
		}

		// building orbitLine after the group is added to the scene, so the group has a parent
		this.OrbitLine.build();

		this.fadeIn();

		if (this.data.materialData) {
			this.buildPlanetMesh();
		}
	}

	buildPlanetMesh() {
		// will return a promise
		const constructPlanetMesh = async () => {
			if (this.meshGroup) return this.meshGroup;

			const materialData = this.data.materialData;
			const segments = materialData.segments || 32;

			const material = {
				map: materialData.map ? await textureLoader.loadAsync(materialData.map) : null,
				normalMap: materialData.normalMap ? await textureLoader.loadAsync(materialData.normalMap) : null,
				transparent: false,
				emissiveMap: materialData.emissiveMap ? await textureLoader.loadAsync(materialData.emissiveMap) : null,
				emissive: materialData.emissive || null,
				emissiveIntensity: materialData.emissiveIntensity || null
			};

			const planetGroup = new THREE.Group();
			planetGroup.class = this;
			planetGroup.name = this.data.key;

			const geometry = new THREE.SphereBufferGeometry(this.data.diameter, segments, segments);
			const planetMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(material));
			planetMesh.name = this.data.key;
			planetMesh.class = this;
			planetMesh.castShadow = true;
			planetMesh.receiveShadow = false;

			planetGroup.add(planetMesh);

			// if (this.data.englishName === 'Sun') {
			// 	const shaderMaterial = new THREE.ShaderMaterial({
			// 		uniforms: {
			// 			viewVector: {
			// 				type: 'v3',
			// 				value: orrery.camera.position
			// 			}
			// 		},
			// 		vertexShader,
			// 		fragmentShader,
			// 		// side: THREE.FrontSide,
			// 		side: THREE.DoubleSide,
			// 		blending: THREE.AdditiveBlending,
			// 		transparent: true
			// 	});

			// 	const planetGlowMesh = new THREE.Mesh(geometry, shaderMaterial);
			// 	planetGroup.add(planetGlowMesh);
			// 	planetGroup.glow = planetGlowMesh;
			// 	planetGlowMesh.scale.set(1.2, 1.2, 1.2);
			// }

			return planetGroup;
		};

		const constructRingMeshes = async (ring, i) => {
			if (!ring) return;
			const ringMaterial = {
				map: ring.map ? await textureLoader.loadAsync(ring.map) : null,
				normalMap: ring.normalMap ? await textureLoader.loadAsync(ring.normalMap) : null,
				transparent: false,
				emissiveMap: ring.emissiveMap ? await textureLoader.loadAsync(ring.emissiveMap) : null,
				emissive: ring.emissive || null,
				emissiveIntensity: ring.emissiveIntensity || null,
				side: THREE.DoubleSide,
				blending: THREE.CustomBlending
			};

			ringMaterial.blendEquation = THREE.MaxEquation;
			ringMaterial.blendSrc = THREE.OneFactor;
			ringMaterial.blendDst = THREE.DstAlphaFactor;

			const ringMesh = new THREE.Mesh(
				ringUVMapGeometry(
					this.data.meanRadius + this.data.rings[i].inner,
					this.data.meanRadius + this.data.rings[i].outer
				),
				new THREE.MeshStandardMaterial(ringMaterial)
			);

			// TODO: Rings don't seem to be receiving shadows...
			ringMesh.name = `${this.data.key} ring ${i}`;
			ringMesh.receiveShadow = true;

			return ringMesh;
		};

		constructPlanetMesh().then((meshGroup) => {
			this.meshGroup = meshGroup;
			this.labelGroup.add(meshGroup);

			if (this.data.materialData.rings) {
				const ringMeshPromises = this.data.materialData.rings.map((ring, i) => {
					return constructRingMeshes(ring, i);
				});

				Promise.all(ringMeshPromises).then((ringMeshes) => {
					ringMeshes.forEach((ringMesh) => {
						// TODO: this will need to be adjusted later
						ringMesh.rotation.x = THREE.MathUtils.degToRad(90);
						this.meshGroup.add(ringMesh);
					});
				});
			}
		});
	}

	draw() {
		if (!this.meshGroup) return;
		const camToSun = orrery.camera.position.clone().sub(this.labelGroup.position);
		const groupPosition = new THREE.Vector3();
		this.labelGroup.getWorldPosition(groupPosition);
		// const sunScreenPos = this.labelGroup.position.project(orrery.camera);
		this.uniforms.sunPos.value.copy(camToSun.multiplyScalar(-1));

		const visibleW = Math.tan(THREE.MathUtils.degToRad(orrery.camera.fov) / 2) * camToSun.length() * 2;
		const sunScreenRatio = this.data.diameter / visibleW;
		this.uniforms.sunSize.value = sunScreenRatio;
		this.uniforms.randAngle.value = this.uniforms.randAngle.value + 0.001;
		this.uniforms.camAngle.value = camToSun.angleTo(new THREE.Vector3(1, 1, 0));
		this.uniforms.sunScreenPos.value = new THREE.Vector3(0, 0, 0);
		this.labelGroup.lookAt(orrery.camera.position);
	}

	// TODO: seems to be different to moon labels
	fadeOut() {
		if (!this.fadingOut && this.isVisible) {
			this.fadingOut = true;
			gsap.to(this.labelDiv, {
				opacity: 0,
				duration: 0.25,
				onComplete: () => {
					this.fadingOut = false;
					this.isVisible = false;
					this.labelDiv.style.pointerEvents = 'none';
				}
			});
		}
	}

	fadeIn() {
		if (!this.fadingIn && !this.isVisible) {
			this.fadingIn = true;
			this.visible = true;
			gsap.to(this.labelDiv, {
				opacity: 1,
				duration: 1,
				onComplete: () => {
					this.fadingIn = false;
					this.isVisible = true;
					this.labelDiv.style.pointerEvents = '';
				}
			});
		}
	}

	handleDistance() {
		const distance = orrery.camera.position.distanceTo(this.labelGroup.position);
		const cameraZoomedToPlanet = distance < this.data.zoomTo + 50000000;

		if (cameraZoomedToPlanet) {
			orrery.cameraState._currentPlanetInRange = this.data.key;
			// this.labelDiv.classList.add('faded');

			// staggering the building of moon classes to help with performance
			if (this.moonClasses && Object.values(this.moonClasses).length) {
				Object.values(this.moonClasses).forEach((moonClass, i) => {
					if (!moonClass.isAdded) {
						setTimeout(() => {
							moonClass.build();
						}, i * 20);
					}
				});
			}
		} else {
			// TODO: Need a fix for if a second planet immediately replaces the previous one
			if (orrery.cameraState._currentPlanetInRange === this.data.key) {
				orrery.cameraState._currentPlanetInRange = '';
				// this.labelDiv.classList.remove('faded');
			}

			if (this.moonClasses && Object.values(this.moonClasses).length) {
				Object.values(this.moonClasses).forEach((moonClass, i) => {
					if (moonClass.isAdded) {
						setTimeout(() => {
							moonClass.remove();
						}, i * 20);
					}
				});
			}
		}

		if (this.OrbitLine) {
			// if (
			// !orrery.cameraState._currentPlanetInRange ||
			// (orrery.cameraState._currentPlanetInRange && orrery.cameraState._currentPlanetInRange === this.data.key) ||
			// !orrery.cameraState._isInPlaneOfReference ||
			// (orrery.mouseState._clickedClass && orrery.mouseState._clickedClass.data.key === this.data.key) ||
			// (orrery.mouseState._hoveredClass && orrery.mouseState._hoveredClass.data.key === this.data.key)
			// ) {
			this.OrbitLine.fadeIn();
			// } else {
			// this.OrbitLine.fadeOut();
			// }
		}

		if (this.data.englishName === 'Sun') {
			orrery.cameraState._currentZoomDistanceThreshold =
				distance < settings.systemZoomDistanceThresholds[0]
					? 0
					: distance < settings.systemZoomDistanceThresholds[1]
					? 1
					: 2;
		}
	}

	// gross duplicated code
	updateRaycaster() {
		// TODO: This should only run when in range of a planet
		// or just run it against the Sun if not in range?
		const cameraPos = orrery.camera.position;
		const thisPos = new THREE.Vector3();
		this.labelGroup.getWorldPosition(thisPos);
		const vDirection = new THREE.Vector3();
		const direction = vDirection.subVectors(thisPos, cameraPos).normalize();
		this.raycaster.set(cameraPos, direction);
		this.raycasterArrow.position.copy(cameraPos);
		this.raycasterArrow.setDirection(direction);

		// TODO: could be more efficient?
		const intersects = this.raycaster.intersectObjects(scene.children, true);
		const meshIntersects = intersects.filter((i) => i.object && i.object.type === 'Mesh' && i.object.name !== 'skybox');

		if (meshIntersects.length && meshIntersects[0].object.name !== this.data.key) {
			this.labelDiv.classList.add('behind-planet');
		} else {
			this.labelDiv.classList.remove('behind-planet');
		}
	}

	remove() {
		clearInterval(this.intervalCheckDistance);
		this.OrbitLine.remove();

		this.labelGroup.children.forEach((child) => child.removeFromParent());
		if (this.raycasterArrowEnabled) this.raycasterArrow.removeFromParent();
		scene.remove(this.labelGroup);
	}
}

const labelLine = {
	build: (item) => {
		if (!item.includeLabelLine) return;

		const labelGeometry = {
			origInnerRadius: item.diameter * 1.01,
			origSegments: 90
		};
		const labelLine = new THREE.Mesh(
			new THREE.RingBufferGeometry(
				labelGeometry.origInnerRadius,
				labelGeometry.origOuterRadius,
				labelGeometry.origSegments,
				1,
				labelGeometry.origThetaStart,
				labelGeometry.origThetaLength
			),
			new THREE.MeshBasicMaterial({
				color: item.labelColour,
				transparent: true,
				opacity: 0.8,
				blending: THREE.AdditiveBlending,
				side: THREE.FrontSide
				// depthTest: false,
				// depthWrite: false
			})
		);
		labelLine.name = `${item.name} group label line`;
		labelLine.data = labelLine.data || {};
		labelLine.data.labelGeometryOriginal = labelGeometry;
		labelLine.data.planetIsTargeted = false;
		// labelLine.renderOrder = 998;

		return labelLine;
	},

	renderLoop: (planetGroup) => {
		if (!planetGroup || !planetGroup.labelLine) return;
		const labelLine = planetGroup.labelLine;

		labelLine.lookAt(orrery.camera.position);
		let innerRadius = labelLine.geometry.parameters.innerRadius;
		let outerRadius = labelLine.geometry.parameters.outerRadius;
		const { origOuterRadius, origSegments } = labelLine.data.labelGeometryOriginal;
		let regenerate = false;
		if (
			orrery.mouseState._hoveredGroups.length &&
			orrery.mouseState._hoveredGroups.some((g) => g.name === planetGroup.name)
		) {
			if (outerRadius < origOuterRadius * 1.1) {
				outerRadius += easeTo({ from: outerRadius, to: origOuterRadius * 1.1, incrementer: 15 });
				regenerate = true;
			}
			if (regenerate) {
				labelLine.geometry.dispose(); // running this is recommended but seems pointless
				labelLine.geometry = new THREE.RingGeometry(innerRadius, outerRadius, origSegments);
			}
		} else {
			if (outerRadius > origOuterRadius) {
				// will interpolate linearly
				outerRadius += easeTo({ from: outerRadius * 1.1, to: origOuterRadius, incrementer: 15 });
				regenerate = true;
			}
			if (regenerate) {
				labelLine.geometry.dispose();
				labelLine.geometry = new THREE.RingGeometry(innerRadius, outerRadius, origSegments);
			}
		}
	}
};

const rings = {
	build: (item) => {
		if (!item.rings) return;
		const ringsArr = [];
		item.rings.forEach((ring, i) => {
			const ringMesh = new THREE.Mesh(
				ringUVMapGeometry(ring.start, ring.end),
				new THREE.MeshBasicMaterial({
					...ring.material,
					map: textureLoader.load(ring.material.map)
				})
			);

			ringMesh.name = `${item.name} ring ${i}`;
			ringMesh.rotation.x = THREE.MathUtils.degToRad(ring.angle);
			ringsArr.push(ringMesh);
		});

		return ringsArr;
	},
	renderLoop: (planetGroup) => {
		if (!planetGroup || !planetGroup.rings) return;
		const rings = planetGroup.rings;
		rings.forEach((ring) => {
			ring.rotation.z += 0.01;
		});
	}
};

const targetLine = {
	build: (item) => {
		if (!item.includeTargetLine) return;
		// the 1.01 helps offset larger bodies like Jupiter
		const targetLineProps = createCircleFromPoints(item.diameter * 1.2);
		const { geometry, material } = targetLineProps;

		const targetLine = new THREE.Points(geometry, material);
		targetLine.renderOrder = 999;
		targetLine.name = `${item.name} target line`;

		return targetLine;
	},

	renderLoop: (planetGroup) => {
		if (!planetGroup || !planetGroup.targetLine) return;
		const targetLine = planetGroup.targetLine;
		targetLine.lookAt(orrery.camera.position);
		fadeTargetLineOpacity(planetGroup, targetLine);
	}
};

const clickTarget = {
	build: (item) => {
		const clickTargetSizeMobile = Math.min(item.diameter * 50, 8),
			clickTargetSizeDesktop = Math.min(item.diameter * 50, item.diameter + 0.5);

		const clickTargetMesh = new THREE.Mesh(
			new THREE.SphereBufferGeometry(checkIfDesktop() ? clickTargetSizeDesktop : clickTargetSizeMobile, 10, 10),
			new THREE.MeshBasicMaterial({
				side: THREE.FrontSide,
				visible: false, // this should allow it to be picked up by Raycaster, whilst being invisible
				wireframe: true,
				transparent: true,
				opacity: 0.2
			})
		);

		clickTargetMesh.name = `${item.name} click target`;
		clickTargetMesh.data = clickTargetMesh.data || {};
		clickTargetMesh.data.clickTargetSizeMobile = clickTargetSizeMobile;
		clickTargetMesh.data.clickTargetSizeDesktop = clickTargetSizeDesktop;

		return clickTargetMesh;
	},

	renderLoop: (planetGroup) => {
		if (!planetGroup || !planetGroup.clickTarget) return;
		if (planetGroup.data.cameraDistance - planetGroup.data.zoomTo < Math.min(30, planetGroup.data.diameter * 40)) {
			// making sure the geometry is only redrawn once to save performance
			if (planetGroup.clickTarget.geometry.parameters.radius !== planetGroup.data.diameter) {
				planetGroup.clickTarget.geometry.dispose();
				planetGroup.clickTarget.geometry = new THREE.SphereBufferGeometry(planetGroup.data.diameter, 10, 10);
			}
		} else {
			if (
				(orrery.isDesktop &&
					planetGroup.clickTarget.geometry.parameters.radius !== planetGroup.clickTarget.data.clickTargetSizeDesktop) ||
				(!orrery.isDesktop &&
					planetGroup.clickTarget.geometry.parameters.radius !== planetGroup.clickTarget.data.clickTargetSizeMobile)
			) {
				planetGroup.clickTarget.geometry.dispose();
				planetGroup.clickTarget.geometry = new THREE.SphereBufferGeometry(
					orrery.isDesktop
						? planetGroup.clickTarget.data.clickTargetSizeDesktop
						: planetGroup.clickTarget.data.clickTargetSizeMobile,
					10,
					10
				);
			}
		}
	}
};

export { setOrbitVisibility, PlanetLabelClass, OrbitLine, labelLine, targetLine, rings, clickTarget };
