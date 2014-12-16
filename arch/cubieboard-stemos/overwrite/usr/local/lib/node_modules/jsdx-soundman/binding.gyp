{
	'targets': [
		{
			'target_name': 'jsdx_soundman',
			'sources': [ 'src/jsdx_soundman.cpp' ],
			'conditions': [
				['OS=="linux"', {
					'cflags': [
						'<!@(pkg-config --cflags libpulse)'
					],
					'ldflags': [
						'<!@(pkg-config  --libs-only-L --libs-only-other libpulse)'
					],
					'libraries': [
						'<!@(pkg-config  --libs-only-l --libs-only-other libpulse)'
					]
				}]
			]
		}
	]
}
