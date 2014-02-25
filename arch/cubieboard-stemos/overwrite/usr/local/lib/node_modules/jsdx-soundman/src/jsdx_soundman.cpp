#include <v8.h>
#include <node.h>
#include <pthread.h>
#include <uv.h>
#include <pulse/pulseaudio.h>
#include <list>
#include <string>
#include <cmath>

#include "jsdx_soundman.hpp"

namespace JSDXSoundman {
 
	using namespace node;
	using namespace v8;
	using namespace std;

	typedef enum {
		SOUNDMAN_EVENT_SINK
	} SoundmanEvent;

	pa_threaded_mainloop *mainloop;
	pa_mainloop_api *mainloop_api;
	pa_context *context;

	/* Asynchronize and threads */
	bool threadRunning = false;
	uv_async_t *sinkAsync = NULL;

	/* Event handlers */
	NodeCallback *sinkNotify_cb = NULL;

	void _PulseAudioStateCallback(pa_context *context, void *data)
	{
		switch(pa_context_get_state(context)) {
		case PA_CONTEXT_READY:
			break;
		case PA_CONTEXT_FAILED:
			break;
		case PA_CONTEXT_UNCONNECTED:
		case PA_CONTEXT_AUTHORIZING:
		case PA_CONTEXT_SETTING_NAME:
		case PA_CONTEXT_CONNECTING:
		case PA_CONTEXT_TERMINATED:
			break;
		}

		pa_threaded_mainloop_signal(mainloop, 0);
	}

	void _PulseAudioSuccess(pa_context* context, int success, void *data)
	{
		pa_threaded_mainloop_signal(mainloop, 0);
	}

	void _PulseAudioInit(uv_work_t *req)
	{
		mainloop = pa_threaded_mainloop_new();
		mainloop_api = pa_threaded_mainloop_get_api(mainloop);
		context = pa_context_new(mainloop_api, "Sound Manager");
		pa_context_set_state_callback(context, &_PulseAudioStateCallback, NULL);

		pa_threaded_mainloop_lock(mainloop);
		pa_threaded_mainloop_start(mainloop);

		/* Connect to PulseAudio server */
		pa_context_connect(context, NULL, PA_CONTEXT_NOFLAGS, NULL);

		while (pa_context_get_state(context) != PA_CONTEXT_READY && pa_context_get_state(context) != PA_CONTEXT_FAILED) {
			pa_threaded_mainloop_wait(mainloop);
		}

		pa_threaded_mainloop_unlock(mainloop);
	}

	void _PulseAudioInitCompleted(uv_work_t *req, int status)
	{
		HandleScope scope;

		NodeCallback *callback = (NodeCallback *)req->data;

		TryCatch try_catch;
		if (pa_context_get_state(context) != PA_CONTEXT_READY) {
			/* Prepare arguments */
			Local<Value> argv[1] = {
				Local<Value>::New(Exception::Error(String::New("Failed to connect")))
			};

			callback->cb->Call(callback->Holder, 1, argv);
		} else {
			/* Prepare arguments */
			Local<Value> argv[1] = {
				Local<Value>::New(Null())
			};

			callback->cb->Call(callback->Holder, 1, argv);
		}

		delete callback;
		delete req;

		if (try_catch.HasCaught())
			FatalException(try_catch);
	}

	Handle<Value> PulseAudioInit(const Arguments& args)
	{
		HandleScope scope;

		if (!args[0]->IsFunction())
			return Undefined();

		/* Process callback function */
		NodeCallback *callback = new NodeCallback;
		callback->Holder = Persistent<Object>::New(args.Holder());
		callback->cb = Persistent<Function>::New(Local<Function>::Cast(args[0]));

		/* Prepare structure for PulseAudio thread */
		uv_work_t *req = new uv_work_t;
		req->data = callback;

		uv_queue_work(uv_default_loop(), req, _PulseAudioInit, _PulseAudioInitCompleted);

		uv_run(uv_default_loop(), UV_RUN_DEFAULT);

		return Undefined();
	}

	Handle<Value> PulseAudioUninit(const Arguments& args)
	{
		HandleScope scope;

		pa_threaded_mainloop_lock(mainloop);

		if (pa_context_get_state(context) == PA_CONTEXT_READY) {
			pa_context_disconnect(context);
		}

		pa_context_unref(context);

		pa_threaded_mainloop_unlock(mainloop);

		pa_threaded_mainloop_stop(mainloop);
		pa_threaded_mainloop_free(mainloop);

		if (sinkAsync) {
			uv_close((uv_handle_t *)sinkAsync, NULL);
			sinkAsync = NULL;
		}

		return Undefined();
	}

	void _GetPulseAudioSinkName_cb(pa_context *context, const pa_server_info *info, void *data)
	{
		std::string *default_sink_name = (std::string*) data;

		*default_sink_name = info->default_sink_name;

		pa_threaded_mainloop_signal(mainloop, 0);
	}

	void _SinkListCallback(pa_context *c, const pa_sink_info *sink, int eol, void *data)
	{
		if (eol != 0)
			return;

		std::list<pa_sink_info *> *sinks = (std::list<pa_sink_info *> *) data;

		sinks->push_back((pa_sink_info *)sink);

		pa_threaded_mainloop_signal(mainloop, 0);
	}

	pa_sink_info *_GetPulseAudioSink(std::string sink_name)
	{
		std::list<pa_sink_info *> sinks;

		pa_threaded_mainloop_lock(mainloop);

		pa_operation* op = pa_context_get_sink_info_by_name(context, sink_name.c_str(), &_SinkListCallback, &sinks);

		while(pa_operation_get_state(op) != PA_OPERATION_DONE) {
			pa_threaded_mainloop_wait(mainloop);
		}

		pa_operation_unref(op);

		pa_threaded_mainloop_unlock(mainloop);

		if (sinks.empty())
			return NULL;

		return *(sinks.begin());
	}

	pa_sink_info *_GetPulseAudioDefaultSink()
	{
		std::string sink_name;

		pa_threaded_mainloop_lock(mainloop);

		pa_operation* op = pa_context_get_server_info(context, &_GetPulseAudioSinkName_cb, &sink_name);

		while(pa_operation_get_state(op) != PA_OPERATION_DONE) {
			pa_threaded_mainloop_wait(mainloop);
		}

		pa_operation_unref(op);

		pa_threaded_mainloop_unlock(mainloop);

		return _GetPulseAudioSink(sink_name);
	}

	Handle<Value> GetVolume(const Arguments& args)
	{
		HandleScope scope;

		/* Get default sink */
		pa_sink_info *sink = _GetPulseAudioDefaultSink();
		if (sink == NULL)
			return scope.Close(Integer::New(-1));

		pa_threaded_mainloop_lock(mainloop);

		/* Figure percentage of volume */
		int value = (int)floor(((pa_cvolume_avg(&(sink->volume)) * 100.) / PA_VOLUME_NORM) + 0.5);

		pa_threaded_mainloop_unlock(mainloop);

		return scope.Close(Integer::New(value));
	}

	Handle<Value> SetVolume(const Arguments& args)
	{
		HandleScope scope;

		if (args[0]->IsNumber()) {

			/* Get default sink */
			pa_sink_info *sink = _GetPulseAudioDefaultSink();
			if (sink == NULL)
				return scope.Close(Integer::New(-1));

			pa_threaded_mainloop_lock(mainloop);

			pa_volume_t volume = (pa_volume_t) fmax((args[0]->ToInteger()->Value() * PA_VOLUME_NORM) / 100, 0);
			pa_cvolume *cvolume = pa_cvolume_set(&sink->volume, sink->volume.channels, volume);
			pa_operation *op = pa_context_set_sink_volume_by_index(context, sink->index, cvolume, _PulseAudioSuccess, NULL);

			pa_operation_unref(op);

			pa_threaded_mainloop_unlock(mainloop);
		}

		return args.This();
	}

	Handle<Value> IsMuted(const Arguments& args)
	{
		HandleScope scope;

		/* Get default sink */
		pa_sink_info *sink = _GetPulseAudioDefaultSink();
		if (sink == NULL)
			return scope.Close(Integer::New(-1));

		return scope.Close(Boolean::New(sink->mute));
	}

	Handle<Value> Mute(const Arguments& args)
	{
		HandleScope scope;

		/* Get default sink */
		pa_sink_info *sink = _GetPulseAudioDefaultSink();
		if (sink == NULL)
			return scope.Close(Integer::New(-1));

		pa_threaded_mainloop_lock(mainloop);

		pa_operation *op = pa_context_set_sink_mute_by_index(context, sink->index, 1, _PulseAudioSuccess, NULL);

		pa_operation_unref(op);

		pa_threaded_mainloop_unlock(mainloop);

		return args.This();
	}

	Handle<Value> Unmute(const Arguments& args)
	{
		HandleScope scope;

		/* Get default sink */
		pa_sink_info *sink = _GetPulseAudioDefaultSink();
		if (sink == NULL)
			return scope.Close(Integer::New(-1));

		pa_threaded_mainloop_lock(mainloop);

		pa_operation *op = pa_context_set_sink_mute_by_index(context, sink->index, 0, _PulseAudioSuccess, NULL);

		pa_operation_unref(op);

		pa_threaded_mainloop_unlock(mainloop);

		return args.This();
	}

	void _PulseAudioEventCallback(pa_context *context, pa_subscription_event_type_t event, unsigned int index, void *data)
	{

		if ((event & PA_SUBSCRIPTION_EVENT_TYPE_MASK) == PA_SUBSCRIPTION_EVENT_CHANGE) {

			if ((event & PA_SUBSCRIPTION_EVENT_SINK) == PA_SUBSCRIPTION_EVENT_SINK) {

				uv_async_send(sinkAsync);
			}
		}
	}

	void _SetupEvent(uv_work_t *req)
	{
		pa_threaded_mainloop_lock(mainloop);

		/* Set callback function */
		pa_context_set_subscribe_callback(context, _PulseAudioEventCallback, NULL);

		pa_operation *op = pa_context_subscribe(context, (pa_subscription_mask)
			(PA_SUBSCRIPTION_MASK_CLIENT |
			PA_SUBSCRIPTION_MASK_SINK |
			PA_SUBSCRIPTION_MASK_SINK_INPUT),
			NULL, NULL);

		while (pa_operation_get_state(op) != PA_OPERATION_DONE) {
			pa_threaded_mainloop_wait(mainloop);
		}

		pa_operation_unref(op);

		pa_threaded_mainloop_unlock(mainloop);
	}

	void _SinkChangedCallback(uv_async_t *handle, int status)
	{
		NodeCallback *callback = sinkNotify_cb;

		TryCatch try_catch;

		callback->cb->Call(callback->Holder, 0, 0);

		if (try_catch.HasCaught())
			FatalException(try_catch);
	}

	Handle<Value> On(const Arguments& args)
	{
		HandleScope scope;

		if (!args[0]->IsNumber())
			return ThrowException(Exception::Error(String::New("First parameter is integer")));

		if (!args[1]->IsFunction())
			return ThrowException(Exception::Error(String::New("Second parameter is function")));

		/* Process callback function */
		NodeCallback *callback = new NodeCallback;
		callback->Holder = Persistent<Object>::New(args.Holder());
		callback->cb = Persistent<Function>::New(Local<Function>::Cast(args[1]));

		/* Initializing thread */
		if (!threadRunning) {

			/* Prepare structure for PulseAudio thread */
			uv_work_t *req = new uv_work_t;
			uv_queue_work(uv_default_loop(), req, _SetupEvent, NULL);
		}

		switch(args[0]->ToInteger()->Value()) {
		case SOUNDMAN_EVENT_SINK: {
			if (!sinkAsync)
				sinkAsync = new uv_async_t;

			sinkNotify_cb = callback;

			uv_async_init(uv_default_loop(), sinkAsync, _SinkChangedCallback);

			break;
		}
		default:
			return ThrowException(Exception::Error(String::New("No such event")));
		}

		return args.This();
	}

	static void init(Handle<Object> target) {
		HandleScope scope;

		NODE_SET_METHOD(target, "PulseAudioInit", PulseAudioInit);
		NODE_SET_METHOD(target, "PulseAudioUninit", PulseAudioUninit);
		NODE_SET_METHOD(target, "getVolume", GetVolume);
		NODE_SET_METHOD(target, "setVolume", SetVolume);
		NODE_SET_METHOD(target, "isMuted", IsMuted);
		NODE_SET_METHOD(target, "mute", Mute);
		NODE_SET_METHOD(target, "unmute", Unmute);
		NODE_SET_METHOD(target, "on", On);

		JSDX_NODE_DEFINE_CONSTANT(target, "EVENT_SINK", SOUNDMAN_EVENT_SINK);
	}

	NODE_MODULE(jsdx_soundman, init);
}
