/**
 * Scroll snap class is responsible to provide snap point behaviour for a given
 *container.
 * The following options are accepted:
 * - mode: ['horizontal'|'vertical'] default: horizontal
 * - interval: [integer],  snap intervals in pixel, default: 300
 *
 * TODO: replace interval with a generic mechanims to define snap points.
 * TODO: get rid of px/s speeds and instead use only px/ms to avoid confusion
 */
function ScrollSnap(scrollContainer, opts) {
  "use strict";

  var VELOCITY_THRESHOLD = 300;  // px/s

  // default values for options
  var options = extend({interval: 300, mode: 'horizontal', velocityEstimator:'scroll'}, opts);

  var SCROLL_END_WAIT = options.velocityEstimator == 'scroll'? 3*16 : 10*16;

  var touchvc = new VelocityCalculator(20, 'linear');
  var svc = new VelocityCalculator(5, 'linear');

  var didMove = false;
  var didScroll = false;
  var touchComplete = true;
  var isSnapping = false;

  // Track scrollTop value calculated by snap point. The value will be used to
  // override scroll value;
  var expectedScrollP;

  // setup event handlers
  scrollContainer.addEventListener('scroll', scrollHandler);
  scrollContainer.addEventListener('touchstart', touchstartHandler);
  scrollContainer.addEventListener('touchmove', touchmoveHandler);
  scrollContainer.addEventListener('touchend', touchendHandler);
  //Android does not emit a touchend event when user is flicking instead it
  //emits a touchcancel. Use that to indicate the end of touch instead.
  scrollContainer.addEventListener('touchcancel', touchendHandler);

  function scrollHandler(event) {
    // use native scroll values in speed estimation
    recordScroll(event);

    printEvent(event);
    didScroll = true;

    if (isSnapping) {
      // console.log("Snap delta = %d", getPosition() - expectedScrollP);
      // prevent scroll fling by replacing the native the scroll position with
      // the one calculated by snap animation
      if (getPosition() != expectedScrollP) {
        setPosition(expectedScrollP);
      }
    } else {
      if (touchComplete) {
        // trigger snap when scroll has slowed down
        var scrollVelocity = svc.getVelocity();
        if (scrollVelocity && Math.abs(scrollVelocity) < VELOCITY_THRESHOLD) {
          // console.log("snap with scroll speed: %d", scrollVelocity);
          snap(scrollVelocity);
        }
      }
    }
  }

  function touchstartHandler(event) {
    printEvent(event);

    didScroll = false;
    didMove = false;
    touchComplete = false;
    // stop any snap animation which is in progress
    isSnapping = false;


    // reset event buffer for direction/velocity calculation
    touchvc.reset();
    svc.reset();

    recordTouch(event);
  }

  function touchmoveHandler(event) {
    printEvent(event);
    recordTouch(event);
    didMove = true;
  }


  function touchendHandler(event) {
    printEvent(event);
    recordTouch(event);
    
    touchComplete = true;
    didScroll = false;

   if (options.velocityEstimator == 'scroll' ) { 
      // didMove suggest that the touch is a flick. In this case we will allow forthe scroll event to 
      // take over and handle snapping logic. But if there is no scroll event in 3 frames then take over and
      // complete the snap with ZERO initial speed.
      // If there is not move, then this is a single touch with no scroll event expected.  snap immediately.
   
      var waitTime = didMove? 3 * 16 : 0;
      setTimeout(function(){
          if (!didScroll && !isSnapping) {
            snap(0);
          }
      }, waitTime);

    } else if(options.velocityEstimator == 'touch'){ 
      // use touch events to estimate velocity and start the snap ignoring scroll events
      // This will result in jitter. Only use when scroll event are not synced
      // and far between
      var velocity = touchvc.getVelocity() || 200;
      console.log("Snap and use touch velocity: %d", velocity); 
      snap(4*velocity);//TODO remove 4x factor
    } else {
      console.warn("Unknow velocity estimator!");
    }

  }

  function recordTouch(event) {
    if (event.changedTouches){
      var value = -event.changedTouches[0][options.mode == 'vertical'?'clientY':'clientX'];
      touchvc.addValue(value, event.timeStamp);
    }
  }

  function recordScroll(event) {
    var time = event && event.timeStamp || getTime();
    svc.addValue(getPosition(), time);
  }


  /* Implement custom snap logic */
  function snap(velocity) {
    // printEstimates();

    var currentP = getPosition();
    var time = getTime();
    if (options.velocityEstimator == 'touch')
      time = touchvc.getTime();

    var endP, duration;

    if (velocity !== 0) {
      var flingCurve = new FlingCurve(currentP, velocity, time / 1000);
      var flingFinalP = flingCurve.getFinalPosition();
      endP = calculateSnapPoint(flingFinalP);

      // overshoot if snap is in opposite direction of current movement
      var isOvershoot = (endP - currentP) * velocity < 0;

      // Duration should consider additional distance needed to be traveled.
      // Current value is an estimation
      var snapDuration = Math.abs((endP - flingFinalP) / (velocity / 2 / 100));
      var flingDuration = flingCurve.getDuration() * 1000;  // in ms
      duration = snapDuration + flingDuration;
      duration = Math.min(duration, 2000);//cap duration to 2 seconds
      console.log(
        'current: %d, estimated: %d, snap point: %d, duration: %d (%d + %d).',
        currentP, flingFinalP, endP, duration, flingDuration, snapDuration);

    } else {
      //there is no fling;
      endP = calculateSnapPoint(currentP);
      duration = 400;
      console.log('current: %d, snap point: %d, duration: %d.', currentP, endP, duration);
    }

 
    if (endP === currentP) {
      console.log('Already at snap target. No snap animation is required.');
      return;
    }

    // TODO consider emitting snap:start and snap:complete events
    isSnapping = true;
    animateSnap(endP, duration, velocity, function onComplete() {
      console.log("Snap is complete");
      isSnapping = false;
    });
  }


  /**
  * Setup necessary RAF loop for snap animation to reach snap destination
  *
  * @param endP snap destination
  * @param duration snap animation duration in ms.
  * @param velocity current scroll velocity in px/s.
  * @param onCompleteCallback callback is called on completion
  */
  function animateSnap(endP, duration, velocity, onCompleteCallback) {
    console.groupCollapsed('snap animation');
    console.log('Animate to scroll position %d in %d ms.', endP,
                Math.round(duration));

    // var easing = bezierWithInitialVelocity(velocity, isOvershoot);//(0, angle
    // , 1-angle , 1); //temp easing that takes into account velocity

    duration = Math.round(
        duration);  // roundout duration to ensure last frame is shown
    var startTime = getTime(), endTime = startTime + duration;

    // current location
    var startP = getPosition(), lastScrollEventTime = 0;

    expectedScrollP = startP;

    var snapCurve = polynomialCurve(velocity / 1000, endP - startP, duration);

    // Start the RAF loop
    window.requestAnimationFrame(animateSnapLoop);

    function animateSnapLoop(hiResTime) {
      var now = getTime();

      if (didScroll) {
        didScroll = false;
        lastScrollEventTime = now;
      }

      // Schedule new frames until we know that there is no more scroll for at
      // least 3 frames. This ensures browser fling is fully suppressed. The
      // animation may be stopped when a new touchstart event is registered too
      if (isSnapping && (now - lastScrollEventTime < SCROLL_END_WAIT || now < endTime)) {
        window.requestAnimationFrame(animateSnapLoop);
      } else {  // reached the end of the animation
        pauseAnimation();
        return;
      }

      // ensures the last frame is always executed
      now = Math.min(now, endTime);

      // apply easing by modifying animation timing using animFrame
      /* For bezier curve
      // time is the time between 0 to 1
      var animTime = (now - startTime) / duration;
      animTime = easing(animTime);
      var amp = endP - startP;
      var step = amp * animTime;
      var newY = Math.floor(startP + step);
      */


      /*Use polynomial curve*/
      var step = snapCurve(now - startTime);
      var newY = Math.floor(startP + step);

      var currentP = getPosition();
      // console.log('diff: %d, scrollTop: %d, newY: %d, frame: %0.2f',
      //             (expectedScrollP - currentP), currentP, newY, animTime);

      // expectedScrollP overrides native scroll value in scroll events
      expectedScrollP = newY;
      setPosition(expectedScrollP);
    }

    function pauseAnimation() {
      console.groupEnd('snap animations');
      if (onCompleteCallback) onCompleteCallback();
    }
  }


  function calculateSnapPoint(landingP) {
    var interval = options.interval;
    var max = getMaxPosition();

    var closest = Math.round(landingP / interval) * interval;
    closest = Math.min(closest, max);

    return closest;
  }

  // based on chromium ./cc/animation/scroll_offset_animation_curve.cc
  function bezierWithInitialVelocity(velocity, isInverted) {
    // Based on EaseInOutTimingFunction::Create with first control point
    // rotated.
    var r2 = 0.42 * 0.42;
    var v2 = velocity * velocity;
    var x1 = Math.sqrt(r2 / (v2 + 1));
    var y1 = Math.sqrt(r2 * v2 / (v2 + 1));

    if (isInverted) {
      return window.BezierEasing(y1, x1, 0.58, 1);
    } else {
      return window.BezierEasing(x1, y1, 1, 0.58);
    }
  }

  /**
  *The following curve satisfies these conditions:
  * * V is continous
  *  - V starts at v0, and ends 0 at duration.
  *  - d(duration) is distance.
  */
  function polynomialCurve(initialVelocity, distance, duration) {
    var T = duration, T2 = duration * duration, T3 = T2 * T;
    var D = distance;

    var v0 = initialVelocity, a = 3 * v0 / T2 - 6 * D / T3,
        b = 6 * D / T2 - 4 * v0 / T;

    return function curve(t) {
      // to ensure we always end up at distance at the end.
      if (t === duration) {
        return distance;
      }

      var t2 = t * t, t3 = t * t * t;
      return 0.33 * a * t3 + 0.5 * b * t2 + v0 * t;
    };
  }

  // Utility functions
  var getTime = Date.now || function() { return new Date().getTime(); };

  var getPosition = function() { return scrollContainer.scrollTop; };
  var getMaxPosition = function() { return scrollContainer.scrollHeight; };
  var setPosition =
      function(position) { scrollContainer.scrollTop = position; };

  if (options.mode == 'horizontal') {
    getPosition = function() { return scrollContainer.scrollLeft; };
    getMaxPosition = function() { return scrollContainer.scrollWidth; };
    setPosition = function(position) { scrollContainer.scrollLeft = position; };
  }



  function printEvent(event) {
    var p = getPosition();
    var t = getTime();
    //console.log('event %s - position: %d, scrollLasV: %d, scrollV: %d',
    //event.type, p, svc.getLastVelocity(), svc.getVelocity());
  }

  // TODO: move into a utility module
  function extend(obj, source) {
    for (var prop in source) {
      obj[prop] = source[prop];
    }
    return obj;
  }

  function printEstimates() {
    // print(velocityCalculator, "** SCROLL");
    // print(svc, "** TOUCH");

    function print(velocityCalculator, label) {
      var velocity = velocityCalculator.getVelocity();
      var position = getPosition();
      var flingCurve = new FlingCurve(position, velocity,
                                      velocityCalculator.getTime() / 1000);

      console.log("%s end position: %d, (fling duration:%d), velocity: %d ",
                  label, flingCurve.getFinalPosition(),
                  flingCurve.getDuration() * 1000, velocity);
    }
  }

  this.setOptions = function(opts) { extend(options, opts); };

  return this;
}
