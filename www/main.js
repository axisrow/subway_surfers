main();

// Lightning storm every 30 seconds while playing
setInterval(() => {
  if (!isPlaying()) {
    return;
  }
  displayMessage('WOAH! LIGHTNING!');
  flashLightning();
}, 30000);

// Game logic runs at a fixed 60 updates per second, independent of the
// display refresh rate (60 / 90 / 120 Hz phones and ProMotion MacBooks).
const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 15;

function main() {
  const canvas = document.querySelector('#glcanvas');
  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');

  if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // Vertex shader program
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aVertexNormal;
    attribute vec2 aTextureCoord;

    uniform mat4 uNormalMatrix;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform bool flash;

    varying highp vec2 vTextureCoord;
    varying highp vec3 vLighting;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vTextureCoord = aTextureCoord;

      highp vec3 ambientLight = vec3(0.3, 0.3, 0.3);

      // highp vec3 directionalLightColor = vec3(1.0, 1.0, 1.0);
      highp vec3 directionalLightColor = vec3(1.0, 0.95, 0.82);

      // highp vec3 directionalVector = vec3(0.85, 0.8, 0.75);
      highp vec3 directionalVector = vec3(0.25, 0.8, 0.75);

      if(flash) {
        directionalLightColor = vec3(1.7, 1.7, 1.7);
      }

      highp vec4 transformedNormal = uNormalMatrix * vec4(aVertexNormal, 1.0);

      highp float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
      vLighting = ambientLight + (directionalLightColor * directional);
    }
  `;

  // Fragment shader program
 const fsSource = `
    precision mediump float;
    varying highp vec2 vTextureCoord;
    varying highp vec3 vLighting;

    uniform sampler2D uSampler;
    uniform float now;
    uniform bool grayscale;

    vec4 convertToGrayscale(in vec4 color) {
      float mean = (color.r + color.g + color.b) / 3.0;
      return vec4(mean, mean, mean, 1.0);
    }

    vec4 convertToColor(in vec4 gray, in vec4 color) {
      return (gray * color);
    }

    void main(void) {
      highp vec4 texelColor = texture2D(uSampler, vTextureCoord);

      if(grayscale)
      {
        gl_FragColor = convertToGrayscale(vec4(texelColor.rgb * vLighting, texelColor.a));
      }
      else
      {
        gl_FragColor = vec4(texelColor.rgb * vLighting, texelColor.a);
      }

    }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
      uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
      grayscale: gl.getUniformLocation(shaderProgram, 'grayscale'),
      flash: gl.getUniformLocation(shaderProgram, 'flash'),
    },
  };

  createDynamic(gl);
  createStatic(gl);

  actual_distance = 10.0;

  // "Play again" reloads the page; start straight away in that case
  try {
    if (sessionStorage.getItem('autostart')) {
      sessionStorage.removeItem('autostart');
      STARTED = true;
    }
  } catch (e) { /* storage unavailable */ }
  updateOverlay();

  let last = null;
  let accumulator = 0;
  let lastState = '';
  let shownScore = -1;

  function frame(nowMs) {
    const now = nowMs * 0.001;  // convert to seconds
    let dt = last === null ? 0 : now - last;
    last = now;
    if (dt > 0.25) {
      dt = 0.25;  // e.g. after the tab was in the background
    }

    if (isPlaying()) {
      accumulator += dt;
      let steps = 0;
      // The 0.9 tolerance absorbs requestAnimationFrame jitter on 60 Hz screens
      while (accumulator >= STEP * 0.9 && steps < MAX_STEPS_PER_FRAME && isPlaying()) {
        update(gl);
        accumulator -= STEP;
        ++steps;
      }
      if (steps === MAX_STEPS_PER_FRAME) {
        accumulator = 0;
      }
    } else {
      accumulator = 0;
    }

    // React to state changes (start / pause / game over)
    const state = `${STARTED}|${GAME}|${PAUSE}`;
    if (state !== lastState) {
      lastState = state;
      if (!GAME) {
        gameOverAt = performance.now();
        if (WIN) {
          displayMessage(`YOU WIN! YOUR SCORE: ${coins}`);
        } else {
          displayMessage(`YOU LOSE! YOUR SCORE: ${coins}`);
        }
      }
      updateOverlay();
      syncAudio();
      needsRedraw = true;
    }

    if (coins !== shownScore) {
      shownScore = coins;
      document.getElementById('score').textContent = String(coins);
    }

    // While paused / on a menu only redraw when something changed (saves battery)
    if (isPlaying() || needsRedraw) {
      needsRedraw = false;
      drawFrame(gl, programInfo);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Run one fixed step (1/60 s) of game logic.
function update(gl) {
  if(actual_distance >= WIN_LENGTH)
  {
    GAME = false;
    WIN = true;
    return;
  }

  actual_distance += speed;
  // Objects appended during this step (new coins) start moving next step
  const count = dynamicObjects.length;
  for(let i = 0; i < count; ++i)
  {
    const object = dynamicObjects[i];
    if (object.dead)
    {
      continue;
    }

    object.translation[2] += speed;
    distance += speed;
    // Speed up train
    if (object.type === 'TRAIN' || (object.type === 'COIN' && object.train))
    {
      object.translation[2] += (2 * speed);
    }
    // Accelerate
    if(Math.floor(distance) % 12000 == 0 && distance > 12000 && speed < 0.45)
    {
      speed += 0.01;
    }

    // Handle objects out of scope of view
    if (object.translation[2] > 32.0)
    {
      switch(object.type)
      {
        case "TRACK":
          object.translation[2] -= 16 * 9;
          break;
        case 'GROUND':
          if(object.translation[2] > 96.0)
          {
            object.translation[2] -= 100 * 2;
          }
          break;
        case 'WALL':
          object.translation[2] -= 25 * 5;
          break;
        case 'TRAIN':
          object.translation[2] -= 300;
          coinsForTrain(gl, i);
          break;
        case 'BARRICADE':
          object.translation[2] -= 370;
          coinsForBarricade(gl, i);
          break;
        case 'COIN':
          // Missed coins never come back (new ones spawn with barricades and trains)
          object.dead = true;
          break;
        case 'BOOT':
        case 'JETPACK':
        case 'MAGNET':
          object.translation[0] = -3.0 * getRandomInt(-1, 1);
          object.translation[2] = -1.0 * getRandomInt(Math.abs(last_powerup) + 250, Math.abs(last_powerup) + 400);
          last_powerup = object.translation[2];
          break;
        case 'OIL':
        case 'BANANA':
          object.translation[0] = -3.0 * getRandomInt(-1, 1);
          object.translation[2] = -1.0 * getRandomInt(Math.abs(last_slip) + 100, Math.abs(last_slip) + 200);
          last_slip = object.translation[2];
          break;
      }
      if (object.dead)
      {
        continue;
      }
    }

    // Handle collisions
    if(object.type === 'COIN' || object.type === 'BOOT' || object.type === 'JETPACK' || object.type === 'MAGNET')
    {
      object.rotation[1] += 0.05;
      detectCollisionCollectible(i, gl);
      if (object.dead)
      {
        continue;
      }
    }
    else if(object.type === 'BARRICADE' || object.type === 'TRAIN')
    {
      detectDeadlyCollision(i, gl);
    }

    // Jetpack
    if (jetpack_flag && ground > (GROUND_LEVEL - pushDown))
    {
      if(object.type == 'COIN' && object.jetpack == true)
      {
        ;
      }
      else
      {
        object.translation[1] -= 0.05;
        if(object.type === 'GROUND' && first_ground)
        {
          ground -= 0.05;
          first_ground = false;
        }
        else if(object.type === 'GROUND' && !first_ground)
        {
          first_ground = true;
        }
      }
    }
    else if (!jetpack_flag && ground < GROUND_LEVEL)
    {
      object.translation[1] += 0.1;
      if(object.type === 'GROUND' && first_ground)
      {
        ground += 0.1;
        first_ground = false;
      }
      else if(object.type === 'GROUND' && !first_ground)
      {
        first_ground = true;
      }
    }

    // Magnet
    if(magnet_flag && object.type == 'COIN')
    {
      let x_distance = Math.abs(staticObjects[0].translation[0] - object.translation[0]);
      let z_distance = Math.abs(staticObjects[0].translation[2] - object.translation[2]);
      if(x_distance <= 6.5 && z_distance <= 4.0)
      {
        coins += 1;
        object.dead = true;
        continue;
      }
    }

    // Oil and Banana
    if(object.type === 'OIL' || object.type === 'BANANA')
    {
      if(object.translation[0] == staticObjects[0].translation[0] && Math.abs(object.translation[2] - staticObjects[0].translation[2]) < 15.0)
      {
        let dist = Math.sqrt(Math.pow(staticObjects[0].translation[0] - object.translation[0], 2) + Math.pow(staticObjects[0].translation[1] - object.translation[1], 2) + Math.pow(staticObjects[0].translation[2] - object.translation[2], 2));
        if(dist <= 0.65)
        {
          displayMessage('YOU WERE SLOWED DOWN BY OIL OR BANANA PEEL. RUN FASTER!');
          speed = MIN_SPEED;
          distance = 0.0;
          if(danger_flag)
          {
            speed = 0.0;
            jump = 0.0;
          }
          else
          {
            danger_flag = true;
            setTimeout(() => {
              danger_flag = false;
            }, 10000);
          }
          object.translation[0] = -3.0 * getRandomInt(-1, 1);
          object.translation[2] = -1.0 * getRandomInt(Math.abs(last_slip) + 100, Math.abs(last_slip) + 200);
          last_slip = object.translation[2];
        }
      }
    }
  }

  // Drop collected / missed coins
  if (dynamicObjects.some((object) => object.dead))
  {
    dynamicObjects = dynamicObjects.filter((object) => !object.dead);
  }

  // Movement: Right and Left
  if(speed > 0)
  {
    if (direction[0])
    {
      changeLane(-1);
      direction[0] = false;
    }
    else if (direction[3])
    {
      changeLane(1);
      direction[3] = false;
    }
  }

  // Movement: Jumping and Ducking
  if(jumpBuffer > 0 && player_position == ON_GROUND)
  {
    jumpBuffer = 0;
    direction[2] = false;
    gravity = false;
    base = staticObjects[0].translation[1];
  }
  else if(direction[2])
  {
    direction[2] = false;
    gravity = true;
  }
  if(jumpBuffer > 0)
  {
    --jumpBuffer;
  }

  if(gravity)
  {
    checkTrainBelowMe(staticObjects[0].translation);
    if(staticObjects[0].translation[1] > base)
    {
      staticObjects[0].translation[1] -= 0.1;
      checkTrainBelowMe(staticObjects[0].translation);
    }
    if(staticObjects[0].translation[1] <= base)
    {
      // Land exactly on the ground / train roof instead of sinking into it
      staticObjects[0].translation[1] = base;
      player_position = ON_GROUND;
    }
  }
  else
  {
    if(Math.abs(staticObjects[0].translation[1] - base) < (1.5 * jump))
    {
      staticObjects[0].translation[1] += 0.1;
      player_position = IN_AIR;
    }
    else
    {
      gravity = true;
    }
  }

  for(let i = 0; i < staticObjects.length; ++i)
  {
    if(speed == 0 && staticObjects[i].type == 'POLICE')
    {
      if(staticObjects[1].translation[2] >= -7.9)
      {
        staticObjects[1].translation[2] -= 0.5;
        displayMessage('OH NO! YOU GOT CAUGHT');
      }
      else
      {
        GAME = false;
      }
    }
    else if(!danger_flag && staticObjects[i].type == 'POLICE' && distance > 550.0 && staticObjects[i].translation[2] < 3.0)
    {
      staticObjects[i].translation[2] += 0.05;
    }
    else if(danger_flag && staticObjects[i].type == 'POLICE' && staticObjects[i].translation[2] > -6.0)
    {
      staticObjects[i].translation[2] -= 0.2;
    }
  }
  staticObjects[1].translation[0] = staticObjects[0].translation[0];
}

// Move the player one lane left (-1) or right (+1). Bumping into a train or
// barricade while switching lanes knocks you back and lets the police catch up.
function changeLane(step) {
  const lanes = [L_TRACK, M_TRACK, R_TRACK];
  const player = staticObjects[0].translation;
  const from = lanes.indexOf(player[0]);
  const to = from + step;
  if (from < 0 || to < 0 || to >= lanes.length)
  {
    return;
  }

  player[0] = lanes[to];
  if(checkDeadlyCollision(player))
  {
    player[0] = lanes[from];
    speed = MIN_SPEED;
    distance = 0.0;
    if(danger_flag)
    {
      speed = 0.0;
      jump = 0.0;
    }
    else
    {
      danger_flag = true;
      setTimeout(() => {
        danger_flag = false;
      }, 10000);
    }
  }
}

// Render the current state of the world.
function drawFrame(gl, programInfo) {
  resizeCanvas(gl);

  gl.clearColor(0.76, 0.99, 1.0, 1.0);  // Clear to sky colour
  gl.clearDepth(1.0);                   // Clear everything
  gl.enable(gl.DEPTH_TEST);             // Enable depth testing
  gl.depthFunc(gl.LEQUAL);              // Near things obscure far things
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Perspective matrix. The game was designed for a wide screen: on narrower
  // windows widen the field of view so all three lanes stay visible.
  const aspect = gl.canvas.width / gl.canvas.height;
  const DESIGN_ASPECT = 16 / 9;
  let fieldOfView = 45 * Math.PI / 180;
  if (aspect < DESIGN_ASPECT)
  {
    fieldOfView = Math.min(2 * Math.atan(Math.tan(fieldOfView / 2) * DESIGN_ASPECT / aspect), 100 * Math.PI / 180);
  }
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

  for(let i = 0; i < dynamicObjects.length; ++i)
  {
    drawScene(gl, programInfo, dynamicObjects[i], projectionMatrix);
  }
  for(let i = 0; i < staticObjects.length; ++i)
  {
    drawScene(gl, programInfo, staticObjects[i], projectionMatrix);
  }
}
