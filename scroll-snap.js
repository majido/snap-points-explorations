/**
 * Create a scroll snap object
 */
function ScrollSnap(scrollContainer, opts) {
  "use strict";

  // default values for options
  var options = {flingMode: 'ignore', interval: 500};
  extend(options, opts);

  this.scrollContainer = scrollContainer;

  var touchVelocityCalculator = new VelocityCalculator(20);
  var svc = new VelocityCalculator(20);



  var flingCurve;

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
    didScroll = true;
    svc.addValue(getPosition(), event.timeStamp);

    printEvent(event);

    if (isSnapping) {
      console.log("snap delta = %d", scrollContainer.scrollTop - expectedScrollTop);

      //prevent fling by setting the scrollTop value with our own
      if (scrollContainer.scrollTop != expectedScrollTop) {
        scrollContainer.scrollTop = expectedScrollTop;
      }
      
    } else {
      // velocityCalculator.addValue(getPosition(), getTime());
      //printEstimates();
    } 

  }

  function touchstartHandler(event) {
    // reset event buffer for direction/velocity calculation
    printEvent(event);
    touchVelocityCalculator.reset();
    svc.reset();

    isSnapping = false;
    recordTouch(event);
  }

  function touchmoveHandler(event) {
    printEvent(event);
    recordTouch(event);
    printEstimates();

  }


  function touchendHandler(event) {
    printEvent(event);
    // handle first touchend after scrolling is complete
    if (!didScroll) return;
    recordTouch(event);
    printEstimates();
    
    console.log("----------------------------");

    snap();
   }

  function recordTouch(event){
    if (event.changedTouches)
      touchVelocityCalculator.addValue(-event.changedTouches[0].clientY, event.timeStamp);
  }


  /* Implement custom snap logic */
  function snap(direction) {

    var currentY = getPosition();
    var velocity = touchVelocityCalculator.getVelocity();
    var time = touchVelocityCalculator.getTime();
    

    flingCurve = new FlingCurve(currentY, velocity, time / 1000);
    var flingFinalPos = flingCurve.getFinalPosition();
    var destinationY = calculateSnapPoint(flingFinalPos);
    var isOvershoot = Math.abs(flingFinalPos - currentY) > Math.abs(destinationY - currentY);
    var duration = 2 * Math.max(100, flingCurve.getDuration() * 1000);
    
    console.log('current: %d, estimated: %d, snap point: %d (duration: %d).', currentY, flingFinalPos, destinationY, duration);
    
    if (destinationY === currentY) {
      didScroll = false;
      console.log('Already at snap target so no snap animation is required.');
      return;
    }

    console.log('Snap destination %d is %d pixel further. Direction: %d', destinationY,
                destinationY - currentY, direction);
    

    // var easing = window.BezierEasing.css['ease-out'];
    //var easing = window.BezierEasing(0.215, 0.61, 0.355, 1);  // easeOutCubic
    var easing = bezierWithInitialVelocity(velocity);//(0, angle , 1-angle , 1); //temp easing that takes into account velocity

    var overshootFactor = isOvershoot? Math.abs((flingFinalPos - destinationY)/(flingFinalPos - currentY)): 0;
    console.log('Overshoot by factor %f', overshootFactor);
    //easing = bezierWithInitialVelocity(velocity, overshootFactor);


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
      scrollContainer.scrollTop = expectedScrollTop = newY;
    }

    function pauseAnimation(){
      console.groupEnd('snap animations');
      console.log('Current scrollTop at %d', getPosition());
      if (onCompleteCallback) onCompleteCallback();
    }
  }

  //based on chromium ./cc/animation/scroll_offset_animation_curve.cc
  function bezierWithInitialVelocity(velocity){
    // Based on EaseInOutTimingFunction::Create with first control point rotated.
    var r2 = 0.42 * 0.42;
    var v2 = velocity * velocity;
    var x1 = Math.sqrt(r2 / (v2 + 1));
    var y1 = Math.sqrt(r2 * v2 / (v2 + 1));

    return window.BezierEasing(x1, y1, 0.58 , 1);
  }
  // Utility functions
  var getTime = Date.now || function() { return new Date().getTime(); };

  function getPosition() { return scrollContainer.scrollTop; }

  var tp, pp;
  function printEvent(event) {
    var p = getPosition();
    var t = getTime();
    var velocity = pp ? (p - pp)/(t-tp) * 1000 : 0;

    console.log('event %s. scrollTop: %d. v: %d', event.type, p, velocity);
    pp = p; tp = t;

  }
  // TODO: move to a utility module
  function extend(obj, source) {
    for (var prop in source) {
      obj[prop] = source[prop];
    }
  }

  function printEstimates(){
    //print(velocityCalculator, "** SCROLL");
    print(touchVelocityCalculator, "** TOUCH");
    

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
