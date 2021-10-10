import { DoubleSide, SphereBufferGeometry } from 'three';
import textureSun from './../img/textures/sun.jpg';
import textureMercury from './../img/textures/mercury.jpg';
import textureVenus from './../img/textures/venus.jpg';
import textureEarth from './../img/textures/earth.jpg';
import textureMoon from './../img/textures/moon.jpg';
import textureMars from './../img/textures/mars.jpg';
import textureJupiter from './../img/textures/jupiter.jpg';
import textureSaturn from './../img/textures/saturn.jpg';
import textureSaturnRing from './../img/textures/saturn-ring-alpha.png';
import textureUranus from './../img/textures/uranus.jpg';
import textureNeptune from './../img/textures/neptune.jpg';
// import normal from './../img/textures/normal.jpg';
import normalMercury from './../img/textures/normal-mercury.jpg';
import normalVenus from './../img/textures/normal-venus.jpg';
import normalEarth from './../img/textures/normal-earth.jpg';
import normalMoon from './../img/textures/normal-moon.jpg';
import normalMars from './../img/textures/normal-mars.jpg';
import sunFragment from './../shaders/sun/fragment.glsl';
import sunVertex from './../shaders/sun/vertex.glsl';
import sunSpecialFragment from './../shaders/sun/shaderSun/fragment.glsl';
import sunSpecialVertex from './../shaders/sun/shaderSun/vertex.glsl';
import sunAtmosphereFragment from './../shaders/sun/shaderAtmosphere/fragment.glsl';
import sunAtmosphereVertex from './../shaders/sun/shaderAtmosphere/vertex.glsl';
import earthFragmentShader from './../shaders/earthFragment.glsl';
import earthVertexShader from './../shaders/earthVertex.glsl';
import earthAtmosphereFragmentShader from './../shaders/earthAtmosphereFragment.glsl';
import earthAtmosphereVertexShader from './../shaders/earthAtmosphereVertex.glsl';

const sun = {
	name: 'sun',
	geometry: new SphereBufferGeometry(8, 64, 64),
	material: {
		map: textureSun,
		vertexShader: sunVertex,
		fragmentShader: sunFragment
	},
	specialSunShader: {
		vertexShader: sunSpecialVertex,
		fragmentShader: sunSpecialFragment
	},
	atmosphere: {
		name: 'sun atmosphere',
		geometry: new SphereBufferGeometry(2.2, 64, 64),
		material: {
			vertexShader: sunAtmosphereVertex,
			fragmentShader: sunAtmosphereFragment
		}
	}
};

const mercury = {
	name: 'mercury',
	orbitRadius: 20,
	size: 0.3,
	segments: 32,
	labelColour: '#b78668',
	material: {
		map: textureMercury,
		normal: normalMercury
	}
};

const venus = {
	name: 'venus',
	orbitRadius: 34,
	size: 0.8,
	segments: 32,
	labelColour: '#f3b3b3',
	material: {
		map: textureVenus,
		normal: normalVenus
	}
};

const earth = {
	name: 'earth',
	orbitRadius: 48,
	size: 1,
	segments: 32,
	labelColour: '#6dcbe7',
	material: {
		// vertexShader: earthVertexShader,
		// fragmentShader: earthFragmentShader,
		map: textureEarth,
		normal: normalEarth
	},
	// atmosphere: {
	// 	name: 'earth atmosphere',
	// 	material: {
	// 		vertexShader: earthAtmosphereVertexShader,
	// 		fragmentShader: earthAtmosphereFragmentShader
	// 	}
	// },
	moons: [
		{
			name: 'moon luna',
			orbitRadius: 2.2,
			size: 0.4,
			segments: 32,
			labelColour: '#dae0e0',
			material: {
				map: textureMoon
				// normal: normalMoon
			}
		}
	]
};

const mars = {
	name: 'mars',
	orbitRadius: 60,
	size: 0.6,
	segments: 32,
	labelColour: '#dae0e0',
	material: {
		map: textureMars,
		normal: normalMars
	}
};

const jupiter = {
	name: 'jupiter',
	orbitRadius: 102,
	size: 2.4,
	segments: 64,
	labelColour: '#e0ab79',
	material: {
		map: textureJupiter
	}
};

const saturn = {
	name: 'saturn',
	orbitRadius: 150,
	size: 2.2,
	segments: 64,
	labelColour: '#ffe577',
	material: {
		map: textureSaturn
	},
	rings: [
		{
			name: 'saturn ring',
			material: {
				color: 0xffffff,
				transparent: true,
				map: textureSaturnRing,
				side: DoubleSide
			}
		}
	]
};

const uranus = {
	name: 'uranus',
	orbitRadius: 190,
	size: 1.4,
	segments: 64,
	labelColour: '#c8ecef',
	material: {
		map: textureUranus
	}
};

const neptune = {
	name: 'neptune',
	orbitRadius: 240,
	size: 1.4,
	segments: 64,
	labelColour: '#3b54d2',
	material: {
		map: textureNeptune
	}
};

export { sun, mercury, venus, earth, mars, jupiter, saturn, uranus, neptune };
