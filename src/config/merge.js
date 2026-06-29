const { mergeWithCustomize } = require('webpack-merge');

const REPLACE = Symbol('replace');

function replace(arr) {
    const tagged = arr.slice();
    Object.defineProperty(tagged, REPLACE, { value: true, enumerable: false });
    return tagged;
}

function customMerge(preset, user) {
    return mergeWithCustomize({
        customizeArray: (presetArr, userArr) => {
            if (userArr && userArr[REPLACE]) return Array.from(userArr);
            return [...(presetArr || []), ...(userArr || [])];
        },
    })(preset, user);
}

module.exports = { customMerge, replace, REPLACE };
