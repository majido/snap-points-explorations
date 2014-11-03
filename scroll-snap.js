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

  var VELOCITY_THRESHOLD = 500;  // px/s
  var FD = 16;  // frame duration

  // default values for options
  var options = extend({
                         mode: 'horizontal',
                         snapDestination: 'center',
                         velocityEstimator: 'scroll'
                       },
                       opts);


  var snapOffset = 0;
  if (options.snapDestination == 'center') {
    snapOffset = (options.mode == 'horizontal') ?
                     scrollContainer.offsetWidth / 2 :
                     scrollContainer.offsetHeight / 2;
  }

  var isSnapping = false, didScroll = false;

  // Track scrollTop value calculated by snap point. The value will be used to
  // override scroll value;
  var expectedScrollP;

  // setup event handlers

  if ('onbeforescroll' in document) {
    scrollContainer.addEventListener('beforescroll', beforescrollHandler);
    scrollContainer.addEventListener('scroll', scrollHandler);
    scrollContainer.addEventListener('touchstart', touchstartHandler);
    scrollContainer.addEventListener('touchend', touchendHandler);
    scrollContainer.addEventListener('touchcancel', touchendHandler);
  } else {
    console.warn("beforescroll event is not supported.");
  }

  function beforescrollHandler(event) {
    // console.log(
    //   "p " + getPosition() + ",\t" +
    //   "dx " + event.deltaX.toFixed(2) + ",\t" +
    //   "dy " + event.deltaY.toFixed(2) + ",\t" +
    //   "dg " + event.deltaGranularity.toFixed(2) + ",\t" +
    //   "vx " + event.velocityX.toFixed(2) + ",\t" +
    //   "vy " + event.velocityY.toFixed(2) + ",\t" +
    //   "in " + event.inInertialPhase + ",\t" +
    //   "en " + event.isEnding);

    event.preventDefault();

    if (isSnapping) {
      //prevent native scroll by consuming the delta
      event.consumeDelta(event.deltaX, event.deltaY);
    } else {
      // trigger snap when scroll has slowed down or if it is just finishing
      if (event.inInertialPhase || event.isEnding) {
        var scrollVelocity =
            -1 * (options.mode == 'horizontal' ? event.velocityX : event.velocityY);
        var deltaP = -1 * (options.mode == 'horizontal' ? event.deltaX : event.deltaY);

        if (event.isEnding || Math.abs(scrollVelocity) < VELOCITY_THRESHOLD) {
          // test(event.timeStamp, scrollVelocity, deltaP);
          // console.log("snap with scroll speed: %d", scrollVelocity);
          snap(event.timeStamp, scrollVelocity, deltaP);
        }
      }
    }
  }

  function scrollHandler(event) { didScroll = true; }

  function touchstartHandler(event) {
    // stop any snap animation which is in progress
    isSnapping = false;
    didScroll = false;
  }

  function touchendHandler(event) {
    // didMove suggest that the touch is a flick. In this case we will allow
    // forthe scroll event to
    // take over and handle snapping logic. But if there is no scroll event in 3
    // frames then take over and
    // complete the snap with ZERO initial speed.
    // If there is not move, then this is a single touch with no scroll event
    // expected.  snap immediately.

    var waitTime = 3 * FD;
    setTimeout(function() {
      if (!didScroll && !isSnapping) {
        snap(0);
      }
    }, waitTime);
  }

  /* Implement custom snap logic */
  function snap(time, velocity, deltaP) {
    // printEstimates();

    var currentP = getPosition();

    var endP, duration;

    if (Math.abs(velocity) > 1) {
      var flingCurve = new FlingCurve(currentP + deltaP, velocity, time / 1000);
      var flingFinalP = flingCurve.getFinalPosition();

      endP = calculateSnapPoint(flingFinalP);

      // Duration should consider additional distance needed to be traveled.
      // Current value is an estimation
      var snapDuration = Math.abs((endP - flingFinalP) / (velocity / 2 / 100));
      var flingDuration = flingCurve.getDuration() * 1000;  // in ms
      duration = snapDuration + flingDuration;
      console.log(
          'current: %d, estimated: %d, snap point: %d, duration: %d (%d + %d).',
          currentP, flingFinalP, endP, duration, flingDuration, snapDuration);

    } else {
      // there is no fling;
      endP = calculateSnapPoint(currentP);
      duration = Math.abs(endP - currentP) / 1;  // 1 px/ms speed
      console.log('current: %d, snap point: %d, duration: %d.', currentP, endP,
                  duration);
    }

    // cap duration to be between 5 frames to 125 frames
    duration = clamp(duration, FD * 5, FD * 125);



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
    // round duration to closest frame number ensure last frame is shown
    duration = FD * Math.round(duration / FD);
    // current location
    var startTime, didLastFrame = false, startP = getPosition();
    var snapCurve = polynomialCurve(velocity / 1000, endP - startP, duration);
    expectedScrollP = startP;

    console.log('Animate to scroll position %d in %d ms.', endP, duration);
    console.groupCollapsed('snap animation');

    window.requestAnimationFrame(animateSnapLoop);

    function animateSnapLoop(now) {
      now = parseInt(now);
      startTime = startTime || now;

      var progress = now - startTime;
      progress = Math.min(progress, duration);

      // Schedule new frames until we know that there is no more scroll for at
      // least 3 frames. This ensures browser fling is fully suppressed. The
      // animation may be stopped when a new touchstart event is registered too
      if (isSnapping && !didLastFrame) {
        window.requestAnimationFrame(animateSnapLoop);
      } else {  // reached the end of the animation
        pauseAnimation();
        return;
      }

      didLastFrame = (progress == duration);
      console.log("progress", progress);

      /*Use polynomial curve*/
      var step = snapCurve(progress);
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


  var calculateSnapPoint = options.interval ? intervalSnap : elementSnap;

  function intervalSnap(landingP) {
    var interval = options.interval;
    var max = getMaxPosition();

    var closest = Math.round(landingP / interval) * interval;
    closest = Math.min(closest, max);

    return closest;
  }

  var snapPoints;
  function elementSnap(landingP) {
    if (!snapPoints) {
      snapPoints = [0]
                       .concat(getChildOffsets(scrollContainer))
                       .concat([getMaxPosition()]);
    }

    var closest = binarySearch(snapPoints, landingP);
    console.log(closest);
    return closest;
  }

  /** compute snap points based on children offsets */
  function getChildOffsets($el) {
    var result = [];
    var parentEdge = getEdge($el);

    for (var i = 0, len = $el.children.length; i < len; i++) {
      var child = $el.children[i], snapPoint = getEdge(child);
      // If child's offsetParent is different from the given scroller element
      // then adjust to make positions local to the scroller element
      snapPoint -= (child.offsetParent != $el) ? parentEdge : 0;

      // Adjust if we are snapping to center
      snapPoint +=
          (options.snapDestination == 'center') ? getDimension(child) / 2 : 0;

      result.push(snapPoint);
    }

    return result;
  }

  /*
  * Finds the closest array item to the value.
  * Arrary should be sorted ascending.
  */
  function binarySearch(array, value) {
    function findClosest(left, right) {
      if (right == left) return array[value];

      if (right - left == 1) {
        if (Math.abs(array[right] - value) < Math.abs(array[left] - value))
          return array[right];
        else
          return array[left];
      }

      var middle = parseInt((right + left) / 2);

      if (value >= array[middle])
        return findClosest(middle, right);
      else
        return findClosest(left, middle);
    }

    return findClosest(0, array.length - 1);
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
  * Constructs a polynomial curve D(t) which satisfies these conditions:
  *  - D(0) = 0 and D(duration)= distance.
  *  - Velocity (dD/dt) is continous
  *  - Velocity is v0 (i.e. initialVelocity) at start (t=0) and 0 at the end
  *(t=duration).
  *
  */
  function polynomialCurve(initialVelocity, distance, duration) {
    var T = duration, T2 = duration * duration, T3 = T2 * T;
    var D = distance;

    var v0 = initialVelocity, a = 3 * v0 / T2 - 6 * D / T3,
        b = 6 * D / T2 - 4 * v0 / T;

    var formula =
        "0.33*" + a + "*t^3+0.5*" + b + "*t^2+" + v0 + "*t, " + distance;
    console.log('Motion Curve: http://www.google.com/?q=' +
                encodeURIComponent(formula));

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

  var getPosition =
      function() { return scrollContainer.scrollTop + snapOffset; };
  var getMaxPosition =
      function() { return scrollContainer.scrollHeight - snapOffset; };
  var setPosition =
      function(position) { scrollContainer.scrollTop = position - snapOffset; };
  var getEdge = function($el) { return $el.offsetTop; };
  var getDimension = function($el) { return $el.offsetHeight; };

  if (options.mode == 'horizontal') {
    getPosition =
        function() { return scrollContainer.scrollLeft + snapOffset; };
    getMaxPosition =
        function() { return scrollContainer.scrollWidth - snapOffset; };
    setPosition = function(position) {
      scrollContainer.scrollLeft = position - snapOffset;
    };
    getEdge = function($el) { return $el.offsetLeft; };
    getDimension = function($el) { return $el.offsetWidth; };
  }


  function printEvent(event) {
    var p = getPosition();
    var t = getTime();
    // console.log('event %s - position: %d, scrollLasV: %d, scrollV: %d',
    // event.type, p, svc.getLastVelocity(), svc.getVelocity());
  }

  // TODO: move into a utility module
  function extend(obj, source) {
    for (var prop in source) {
      obj[prop] = source[prop];
    }
    return obj;
  }

  function clamp(num, min, max) { return Math.min(Math.max(num, min), max); }

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
