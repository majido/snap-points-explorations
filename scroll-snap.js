/**
 * Create a scroll snap object
 */
function ScrollSnap(scrollContainer, opts) {
  "use strict";

  var VELOCITY_THRESHOLD = 200; //px/s

  // default values for options
  var options = extend({interval: 500}, opts);
  
  var touchVelocityCalculator = new VelocityCalculator(20);
  var svc = new VelocityCalculator(5, 'linear');

  var didMove = false;
  var didScroll = false;
  var isSnapping = false;

  //Track scrollTop value calculated by snap point. The value will be used to override scroll value;
  var expectedScrollTop;

  // setup event handlers
  scrollContainer.addEventListener('scroll', scrollHandler);
  scrollContainer.addEventListener('touchstart', touchstartHandler);
  scrollContainer.addEventListener('touchmove', touchmoveHandler);
  scrollContainer.addEventListener('touchend', touchendHandler);

  function scrollHandler(event) {
    recordScroll(event);

    printEvent(event);
    didScroll = true;
    
    if (isSnapping) {
      //console.log("Snap delta = %d", getPosition() - expectedScrollTop);
      //prevent scroll fling by setting the scrollTop value with the one calculated by the snap
      if (getPosition != expectedScrollTop) {
        setPosition(expectedScrollTop);
      }
      
    } else {
      //trigger snap when scroll has slowed down
      var scrollVelocity = svc.getVelocity();
      if (scrollVelocity && Math.abs(scrollVelocity) < VELOCITY_THRESHOLD) {
        console.log("SNAP with scroll speed: %d", scrollVelocity);
        snap();
      }
    } 

  }

  function touchstartHandler(event) {
    printEvent(event);

    didScroll = false; 
    didMove = false;
    isSnapping = false;


    // reset event buffer for direction/velocity calculation
    touchVelocityCalculator.reset();
    svc.reset();

    //TODO we may need to record an initial value in the scroll buffer as well
    recordTouch(event);
    //recordScroll();
  }

  function touchmoveHandler(event) {
    printEvent(event);
    recordTouch(event);
    didMove = true;
  }


  function touchendHandler(event) {
    printEvent(event);
    recordTouch(event);
    
    if (didMove) {
      // this is a flick, ignore it and let the scroll event handle snapping logic
    } else {
      //a single touch with no scroll event expected. snap now!
      snap();
    }
  }

  function recordTouch(event){
    if (event.changedTouches)
      touchVelocityCalculator.addValue(-event.changedTouches[0].clientY, event.timeStamp);
  }

  function recordScroll(event){
    var time = event && event.timeStamp || getTime();
    svc.addValue(getPosition(), time);
  }


  /* Implement custom snap logic */
  function snap() {
    //printEstimates();
    
    var currentP = getPosition();
    var velocity = svc.getVelocity() || 0; 
    var time = getTime();
    

    var flingCurve = new FlingCurve(currentP, velocity, time / 1000);
    var flingFinalP = flingCurve.getFinalPosition();
    var endP = calculateSnapPoint(flingFinalP);

    //overshoot if snap is in opposite direction of current movement 
    var isOvershoot = (endP - currentP) * velocity < 0; 

    //Duration should consider additional distance needed to be traveled. Current value is an estimation 
    var snapDuration =  velocity !== 0? Math.abs((endP - flingFinalP) / (velocity/2/100)) : 200;
    var flingDuration = flingCurve.getDuration() * 1000; //in ms
    var duration = snapDuration + flingDuration;


    console.log("----------------------------");
    console.log('current: %d, estimated: %d, snap point: %d (duration: %d + %d).', currentP, flingFinalP, endP, flingDuration, snapDuration);
    console.log("----------------------------");


    if (endP === currentP) {
      console.log('Already at snap target so no snap animation is required.');
      return;
    }

    console.log('Snap destination %d is %d pixel further.', endP,
                endP - currentP);
    
    //TODO consider emitting snap:start event
    isSnapping = true;
    animateSnap(endP, duration, velocity, function onComplete(){
      //TODO consider emitting snap:complete event
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
    console.log('animate to scrolltop: %d', endP);

    //var easing = bezierWithInitialVelocity(velocity, isOvershoot);//(0, angle , 1-angle , 1); //temp easing that takes into account velocity

    var startTime = getTime(),
        endTime = startTime + duration;

    // current location
    var startP = getPosition(),
        lastScrollEventTime = 0;

    expectedScrollTop = startP;

    var curve = polynomialCurve(velocity/1000, endP - startP, duration);

    // RAF loop
    window.requestAnimationFrame(animateSnapLoop);

    function animateSnapLoop(hiResTime) {
      var now = getTime();

      if (didScroll) {
        didScroll = false;
        lastScrollEventTime = now;  
      }

      //Schedule new frames until we know that there is no more scroll for at least 3 frames
      //This ensures browser fling is fully suppressed. The animation may be stopped when a 
      //new touchstart event is registered too 
      if (isSnapping && (now - lastScrollEventTime < 3*16 || now < endTime)) {
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
      var step = curve(now - startTime);
      var newY = Math.floor(startP + step);

      //simple overshoot
      // if (overshootFactor > 0) {
      //   newY = newY - (amp * overshootFactor * Math.sin(animTime * Math.PI));
      // }

      var currentP = getPosition(); 
      // console.log('diff: %d, scrollTop: %d, newY: %d, frame: %0.2f',
      //             (expectedScrollTop - currentP), currentP, newY, animTime);
      
      //expectedScrollTop will be used to override native scroll value in scroll events
      expectedScrollTop = newY; 
      setPosition(expectedScrollTop);
    }

    function pauseAnimation(){
      console.groupEnd('snap animations');
      console.log('Current scrollTop at %d', getPosition());
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

  //based on chromium ./cc/animation/scroll_offset_animation_curve.cc
  function bezierWithInitialVelocity(velocity, isInverted){

    // Based on EaseInOutTimingFunction::Create with first control point rotated.
    var r2 = 0.42 * 0.42;
    var v2 = velocity * velocity;
    var x1 = Math.sqrt(r2 / (v2 + 1));
    var y1 = Math.sqrt(r2 * v2 / (v2 + 1));

    if (isInverted) {
      return window.BezierEasing(y1, x1, 0.58 , 1);
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

    var v0 = initialVelocity,
        a = 3*v0/T2 - 6*D/T3,
        b = 6*D/T2 - 4*v0/T;

    return function curve(t) {
      //to ensure we always end up at distance at the end.
      if (t == duration) return distance;

      var t2 = t*t, t3 = t*t*t;
      return 0.33 * a * t3 + 0.5 * b * t2 + v0 * t;
    };
  }

  // Utility functions
  var getTime = Date.now || function() { return new Date().getTime(); };

  function getPosition() { return scrollContainer.scrollTop; }
  function getMaxPosition(){return scrollContainer.scrollHeight;}
  function setPosition(position) { scrollContainer.scrollTop = position; }


  function printEvent(event) {
    var p = getPosition();
    var t = getTime();

    console.log('event %s - position: %d, scrollLasV: %d, scrollV: %d', event.type, p, svc.getLastVelocity(), svc.getVelocity());
  }

  // TODO: move to a utility module
  function extend(obj, source) {
    for (var prop in source) {
      obj[prop] = source[prop];
    }

    return obj;
  }

  function printEstimates(){
    //print(velocityCalculator, "** SCROLL");
    print(svc, "** TOUCH");
    

    function print(velocityCalculator, label){
      var velocity = velocityCalculator.getVelocity();
      var position = getPosition();
      var flingCurve = new FlingCurve(position, velocity, velocityCalculator.getTime() / 1000);

      console.log("%s end position: %d, (fling duration:%d), velocity: %d ", label, flingCurve.getFinalPosition(), flingCurve.getDuration()*1000, velocity);
    }
  }

  this.setOptions = function(opts) { extend(options, opts); };

  return this;
}
