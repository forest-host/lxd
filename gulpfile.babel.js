'use strict';

import gulp from 'gulp';
import babel from 'gulp-babel';

gulp.task('default', () => {
	return gulp.src('src/index.js')
		.pipe(babel())
		.pipe(gulp.dest('dist'));
});

