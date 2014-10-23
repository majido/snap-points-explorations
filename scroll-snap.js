/**
 * Create a scroll snap object
 */
function ScrollSnap(scrollContainer, opts) {
  "use strict";

  var VELOCITY_THRESHOLD = 200;

  // default values for options
  var options = {flingMode: 'ignore', interval: 500};
  extend(options, opts);

  this.scrollContainer = scrollContainer;

  var touchVelocityCalculator = new VelocityCalculator(20);
  var svc = new VelocityCalculator(5, 'linear');



  var flingCurve;

  var didMove = false;
  var didScroll = false;
  var isSnapping = false;

  //Track scrollTop value calculated by snap point. The value will be used to override scroll value;
  var expectedScrollTop;

  // setup event handlers
  scrollContainer.addEventListener('scroll', scrollHandler);
  scrollContainer.addEventListener('touchstart', touchstartHandler);
  scrollContainer.addEventListener('touchmove', touchmoveHandler);
  for (var event of['touchend', 'mouseup']) {
    scrollContainer.addEventListener(event, touchendHandler);
  }


  function scrollHandler(event) {
    recordScroll(event);

    printEvent(event);
    didScroll = true;
    
    if (isSnapping) {
      console.log("Snap delta = %d", getPosition() - expectedScrollTop);
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
    
    if (didMove /*didScroll*/) {
      // this is a flick so we let the scroll event handle snapping logic
    } else {
      //a touch that has stopped a previous snap in progress. snap now
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
  function snap(direction) {
    //printEstimates();
    
    var currentY = getPosition();
    var velocity = svc.getVelocity() || 0; //touchVelocityCalculator.getVelocity();
    var time = getTime();//svc.getTime();//touchVelocityCalculator.getTime();
    

    flingCurve = new FlingCurve(currentY, velocity, time / 1000);
    var flingFinalPos = flingCurve.getFinalPosition();
    var destinationY = calculateSnapPoint(flingFinalPos);
    //overshoot if snap is in opposite direction of current movement 
    var isOvershoot = (destinationY - currentY) * velocity < 0; 


   //Duration should consider additional distance needed to be traveled
    var SnapDuration =  velocity !== 0? Math.abs((destinationY - flingFinalPos) / (velocity/2/100)) :200;
    var flingDuration = flingCurve.getDuration() * 1000;
    var duration = SnapDuration + flingDuration;


    console.log("----------------------------");
    console.log('current: %d, estimated: %d, snap point: %d (duration: %d + %d).', currentY, flingFinalPos, destinationY, flingDuration, SnapDuration);
    console.log("----------------------------");


    if (destinationY === currentY) {
      console.log('Already at snap target so no snap animation is required.');
      return;
    }

    console.log('Snap destination %d is %d pixel further.', destinationY,
                destinationY - currentY);
    

    // var easing = window.BezierEasing.css['ease-out'];
    //var easing = window.BezierEasing(0.215, 0.61, 0.355, 1);  // easeOutCubic
    var easing = bezierWithInitialVelocity(velocity, isOvershoot);//(0, angle , 1-angle , 1); //temp easing that takes into account velocity

    if (isOvershoot) {
      var overshootFactor = isOvershoot? Math.abs((flingFinalPos - destinationY)/(flingFinalPos - currentY)): 0;
      console.log('Overshoot by factor %f', overshootFactor);
      //easing = bezierWithInitialVelocity(velocity, overshootFactor);
    }

    //TODO consider emitting snap:start event
    isSnapping = true;
    animateSnap(destinationY, 0, duration, easing, function onComplete(){
      //TODO consider emitting snap:complete event
      console.log("Snap is complete");
      isSnapping = false;
    });
  
  }

  function calculateSnapPoint(landingY) {

    var interval = options.interval;
    var max = scrollContainer.scrollHeight;

    var closest = Math.round(landingY / interval) * interval;
    closest = Math.min(closest, max);

    return closest;
  }


  /**
  * Setup necessary RAF loop for snap animation to reach snap destination
  * @destinationY the destination
  * @duration snap animation duration in ms.
  */
  function animateSnap(destinationY, overshootFactor, duration, easing, onCompleteCallback) {
    console.groupCollapsed('snap animation');
    console.log('animate to scrolltop: %d', destinationY);

    easing = easing || function(t) { return t; };  // default to linear easing

    var startTime = getTime(), endTime = startTime + duration;

    // current location
    var startY = getPosition(),
        lastScrollEventTime = 0;

    expectedScrollTop = startY;

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

      // time is the time between 0 to 1
      var animTime = (now - startTime) / duration;
      // apply easing by modifying animation timing using animFrame
      animTime = easing(animTime);
      var amp = destinationY - startY;
      var step = amp * animTime;  
      var newY = Math.floor(startY + step);

      //simple overshoot
      if (overshootFactor > 0) {
        newY = newY - (amp * overshootFactor * Math.sin(animTime * Math.PI));
      }

      // add exponential bounce
      if (window.bounce) { 
        var decay = 2;
        newY = newY + step * (Math.sin(animTime * Math.PI) / Math.exp(animTime));
      }

      var currentY = getPosition(); 
      console.log('diff: %d, scrollTop: %d, newY: %d, frame: %0.2f',
                  (expectedScrollTop - currentY), currentY, newY, animTime);

      // TODO: this is being overridden by scroller. Find a more
      // appropriate way to do this
      expectedScrollTop = newY; 
      setPosition(expectedScrollTop);
    }

    function pauseAnimation(){
      console.groupEnd('snap animations');
      console.log('Current scrollTop at %d', getPosition());
      if (onCompleteCallback) onCompleteCallback();
    }
  }

  //based on chromium ./cc/animation/scroll_offset_animation_curve.cc
  function bezierWithInitialVelocity(velocity, isInverted){
    // Based on EaseInOutTimingFunction::Create with first control point rotated.
    var r2 = 0.42 * 0.42;
    var v2 = velocity * velocity;
    var x1 = Math.sqrt(r2 / (v2 + 1));
    var y1 = Math.sqrt(r2 * v2 / (v2 + 1));

    if (isInverted) {
      var temp = x1;
      x1 = y1;
      y1 = temp; 
    }

    return window.BezierEasing(x1, y1, 0.58 , 1);
  }
  // Utility functions
  var getTime = Date.now || function() { return new Date().getTime(); };

  function getPosition() { return scrollContainer.scrollTop; }
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
  }

  function printEstimates(){
    //print(velocityCalculator, "** SCROLL");
    print(svc, "** TOUCH");
    

    function print(velocityCalculator, label){
      var velocity = velocityCalculator.getVelocity();
      var position = getPosition();
      flingCurve = new FlingCurve(position, velocity, velocityCalculator.getTime() / 1000);

      console.log("%s end position: %d, (fling duration:%d), velocity: %d ", label, flingCurve.getFinalPosition(), flingCurve.getDuration()*1000, velocity);
    }
  }

  this.setOptions = function(opts) { extend(options, opts); };

  return this;
}
