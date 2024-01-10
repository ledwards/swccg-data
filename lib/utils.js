const titleCase = (title) =>
  title
    .toLowerCase()
    .replace(/[^\s]+/g, (word) =>
      word.replace(/^./, (first) => first.toUpperCase()),
    );

module.exports = {
  titleCase,
};
