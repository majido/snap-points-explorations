# Snap Point implementation
This package provides a demo implementation of snap points using native scroll events.


#Disabling threaded scrolling
The implementation requires the  scrolling to be done in main thread instead of the UI thream. This enables us to properly approximate the native scroll trajectory and override the native scrolling preventing jank.

For chrome, this can be achived by passing the {disable-threaded-scrolling} flag. (See about://flags for more info) 
